import {
  defaultTo,
  drop,
  every,
  forEach,
  forOwn,
  includes,
  isNull,
  isString,
} from 'lodash'
import {
  ColumnDescription,
  Sequelize
} from 'sequelize/types'

import {
  AssociationType,
  EssentialColumnDescription,
  JunctionRuleCallback,
  ParsedColumnDescriptionsByColumnName,
  ParsedColumnReference,
  ParsedColumnsDescriptionsByTableName,
  SchemaMapper,
} from './SchemaMapper'
import { JunctionRule, ModelerSettings } from './SequelizeModeler'

export class MySqlSchemaMapper extends SchemaMapper<
  MySqlIndexMetadata[],
  MySqlForeignKeyReferences[],
  MySqlColumnDescriptionExtra
> {
  constructor(sequelize: Sequelize, settings: MySqlModelerSettings) {
    super(sequelize, settings)
  }

  public async mapSchema(tableNames: string[]) {
    await this.getTableSchemas(tableNames)

    const parsedColumnsDescriptionsByTableName: MySqlParsedColumnsDescriptionsByTableName = new Map()

    await Promise.all(Array.from(this.tableSchemasByName.entries())
      .sort(([ tableNameLeft ], [ tableNameRight ]) => tableNameLeft > tableNameRight ? 1 : -1)
      .map(async([ tableName, schema ]) => {
        const parsedDescriptionsByColumnName: MySqlParsedColumnDescriptionsByColumnName = new Map()

        forOwn(schema.columnsDescription, (description, columnName) => {
          const descriptionExtras = this.mapExtraColumnDescription(description)
          const { dbType } = descriptionExtras
          const essentialDescription: EssentialColumnDescription = {
            tsType: dbType ? defaultTo(MySqlSchemaMapper.tsTypesByDbType.get(dbType), null) : null,
            ormType: dbType ? defaultTo(MySqlSchemaMapper.ormTypesByDbType.get(dbType), null) : null
          }

          parsedDescriptionsByColumnName.set(columnName, {
            ...description,
            ...essentialDescription,
            ...descriptionExtras,
            unique: this.getUniqueAttribute(columnName, schema.indexes),
            reference: this.getReference(columnName, schema.foreignKeyReferences)
          })
        })

        parsedColumnsDescriptionsByTableName.set(tableName, {
          name: tableName,
          columns: parsedDescriptionsByColumnName,
          isJunctionTable: await this.isJunctionTable(schema, parsedDescriptionsByColumnName),
          associations: []
        })
      }))

    this.addAssociations(parsedColumnsDescriptionsByTableName)

    return parsedColumnsDescriptionsByTableName
  }

  protected addAssociations(
    colsByTable: ParsedColumnsDescriptionsByTableName<MySqlColumnDescriptionExtra>
  ) {
    Array.from(this.tableSchemasByName.entries()).map((([sourceTableName, sourceSchema]) => {
      sourceSchema.foreignKeyReferences.map((ref) => {
        const source = colsByTable.get(sourceTableName)
        const target = colsByTable.get(ref.referencedTableName)
        if (!source || !target) return

        // create association on self
        source.associations.push({
          associationType: AssociationType.belongsTo,
          source: sourceTableName,
          target: ref.referencedTableName,
          foreignKey: ref.columnName,
        })

        // create 1 of 3 possible associations on target
        if (source.isJunctionTable) {
          const targetRef = sourceSchema.foreignKeyReferences.find(otherRef => otherRef.columnName !== ref.columnName)
          if (!targetRef) return

          const throughTarget = colsByTable.get(targetRef.referencedTableName)
          if (!throughTarget) return

          target.associations.push({
            associationType: AssociationType.belongsToMany,
            source: target.name,
            target: throughTarget.name,
            through: sourceTableName,
            foreignKey: ref.columnName,
            otherKey: targetRef.columnName,
          })
        } else {
          const sourceDesc = source.columns.get(ref.columnName)
          const isColUnique = (sourceDesc && sourceDesc.unique) === true

          if (isColUnique) {
            target.associations.push({
              associationType: AssociationType.hasOne,
              source: target.name,
              target: sourceTableName,
              foreignKey: ref.columnName,
            })
          } else {
            target.associations.push({
              associationType: AssociationType.hasMany,
              source: target.name,
              target: sourceTableName,
              foreignKey: ref.columnName,
            })
          }
        }
      })
    }))
  }

  protected isJunctionTable: MySqlJunctionRuleCallback = async(schema, cols) => {
    const {
      settings: {
        junctionRules: rules,
        junctionRuleCallback: callback
      }
    } = this

    const callbacksByRule = new Map([
      [ JunctionRule.COMPOSITE_PRIMARY, this.compositePrimaryRule ],
      [ JunctionRule.COMPOSITE_PRIMARY_ONLY, this.compositePrimaryOnlyRule ],
      [ JunctionRule.PRIMARY_AND_TIMESTAMP_ONLY, this.primaryAndTimestampOnlyRule ],
      [ JunctionRule.CALLBACK, callback ],
    ])

    if (includes(rules, JunctionRule.OFF)) return false

    return rules.reduce(async (isJunction, rule) => {
      const callback = callbacksByRule.get(rule)
      if (!callback) return isJunction

      return await isJunction || await callback(schema, cols)
    }, Promise.resolve(false))
  }

  protected compositePrimaryRule: MySqlJunctionRuleCallback = async(schema, cols) => {
    const primaryKeys = this.getPrimaryKeys(cols)
    const primaryForeignKeys = schema.foreignKeyReferences.filter(ref => includes(primaryKeys, ref.columnName))

    return primaryKeys.length  === 2 && primaryForeignKeys.length === 2
  }

  protected compositePrimaryOnlyRule: MySqlJunctionRuleCallback = async(schema, cols) => {
    return await this.compositePrimaryRule(schema, cols) && cols.size === 2
  }

  protected primaryAndTimestampOnlyRule: MySqlJunctionRuleCallback = async(schema, cols) => {
    const primaryKeys = this.getPrimaryKeys(cols)
    const nonPrimaryForeignKeys = schema.foreignKeyReferences
      .map(ref => ref.columnName)
      .filter(columnName => !includes(primaryKeys, columnName))

    const areOthersTimestampOnly = every(Array.from(cols.entries()), ([ columnName, description ]) => {
      return includes(primaryKeys, columnName)
        || includes(nonPrimaryForeignKeys, columnName)
        || description.tsType === 'Date'
    })

    return primaryKeys.length  === 1 && nonPrimaryForeignKeys.length === 2 && areOthersTimestampOnly
  }

  protected getPrimaryKeys(
    cols: ParsedColumnDescriptionsByColumnName<MySqlColumnDescriptionExtra>,
  ): string[] {
    return Array.from(cols.entries()).reduce((colNames, [colName, description]) => {
      if (description.primaryKey) colNames.push(colName)
      return colNames
    }, [] as string[])
  }
  protected getUniqueAttribute(columnName: string, indexes: MySqlIndexMetadata[]): string | true | undefined {
    const uniqueIndex = indexes.find((index) => index.unique
      && !!index.fields.find((field) => field.attribute === columnName)
    )

    if (!uniqueIndex) return
    return (uniqueIndex.fields.length === 1) ? true : uniqueIndex.name
  }

  protected getReference(
    columnName: string,
    foreignKeyReferences: MySqlForeignKeyReferences[],
  ): ParsedColumnReference {
    return foreignKeyReferences.reduce((ref, curr) => {
      if (curr.columnName === columnName) {
        ref.tableName = curr.referencedTableName,
        ref.key = curr.referencedColumnName
      }
      return ref
    }, {} as ParsedColumnReference)
  }

  protected extraAttributesByRegex: [RegExp, (keyof MySqlColumnDescriptionExtra)[]][] = [
    [/(^bigint)(?:\s*\(\s*(\d+)\s*\))?(?:\s*(unsigned)\s*)?/, ['dbType', 'length', 'unsigned']],
    [/(^binary)/, ['dbType']],
    [/(^bit)\s*\(\s*(\d+)\s*\)/, ['dbType', 'length']],
    [/(^blob)/, ['dbType']],
    [/(^bool)/, ['dbType']],
    [/(^char)(?:\s*\(\s*(\d+)\s*\))?/, ['dbType', 'length']],
    [/(^date$)/, ['dbType']],
    [/(^datetime$)/, ['dbType']],
    [/(^decimal)(?:\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?/, ['dbType', 'precision', 'scale']],
    [/(^double)(?:\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?/, ['dbType', 'length', 'decimals']],
    [/(^enum)\s*\(\s*((?:'\w+',?)+)\)/, ['dbType', 'enumEntries']],
    [/(^float)(?:\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?/, ['dbType', 'length', 'decimals']],
    [/(^geometry)/, ['dbType']],
    [/(^int)(?:\s*\(\s*(\d+)\s*\))?(?:\s*(unsigned)\s*)?/, ['dbType', 'length', 'unsigned']],
    [/(^json)/, ['dbType']],
    [/(^jsonb)/, ['dbType']],
    [/(^long)(blob)/, ['length', 'dbType']],
    [/(^long)(text)/, ['length', 'dbType']],
    [/(^medium)(blob)/, ['length', 'dbType']],
    [/(^medium)(text)/, ['length', 'dbType']],
    [/(^mediumint)(?:\s*\(\s*(\d+)\s*\))?(?:\s*(unsigned)\s*)?/, ['dbType', 'length', 'unsigned']],
    [/(^ntext)/, ['dbType']],
    [/(^numeric)/, ['dbType']],
    [/(^real)(?:\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?/, ['dbType', 'length', 'precision']],
    [/(^set)\s*\(\s*((?:'\w+',?)+)\)/, ['dbType', 'enumEntries']],
    [/(^smallint)(?:\s*\(\s*(\d+)\s*\))?(?:\s*(unsigned)\s*)?/, ['dbType', 'length', 'unsigned']],
    [/(^text)/, ['dbType']],
    [/(^time)/, ['dbType']],
    [/(^timestamp)/, ['dbType']],
    [/(^tiny)(blob)/, ['length', 'dbType']],
    [/(^tiny)(text)/, ['length', 'dbType']],
    [/(^tinyint)(?:\s*\(\s*(\d+)\s*\))?(?:\s*(unsigned)\s*)?/, ['dbType', 'length', 'unsigned']],
    [/(^uniqueidentifier)/, ['dbType']],
    [/(^uuid)/, ['dbType']],
    [/(^varbinary)/, ['dbType']],
    [/(^varchar)(?:\s*\(\s*(\d+)\s*\))?/, ['dbType', 'length']],
    [/(^year)/, ['dbType']]
  ]

  protected static tsTypesByDbType = new Map<MySqlColumnType, string>([
    ['bigint', 'number'],
    ['binary', 'JSON'],
    ['bit', 'boolean'],
    ['blob', 'JSON'],
    ['bool', 'boolean'],
    ['char', 'string'],
    ['date', 'Date'],
    ['datetime', 'Date'],
    ['decimal', 'number'],
    ['double', 'number'],
    ['enum', 'string'],
    ['float', 'number'],
    ['geometry', 'string'],
    ['int', 'number'],
    ['json', 'JSON'],
    ['jsonb', 'JSON'],
    ['longblob', 'JSON'],
    ['longtext', 'string'],
    ['mediumblob', 'JSON'],
    ['mediumint', 'number'],
    ['mediumtext', 'string'],
    ['ntext', 'string'],
    ['numeric', 'number'],
    ['real', 'number'],
    ['set', 'string'],
    ['smallint', 'number'],
    ['text', 'string'],
    ['time', 'string'],
    ['timestamp', 'Date'],
    ['tinyblob', 'JSON'],
    ['tinyint', 'number'],
    ['tinytext', 'string'],
    ['uniqueidentifier', 'string'],
    ['uuid', 'string'],
    ['varbinary', 'string'],
    ['varchar', 'string'],
    ['year', 'number'],
  ])

  protected static ormTypesByDbType = new Map<MySqlColumnType, string>([
    ['bigint', 'BIGINT'],
    ['binary', 'BLOB'],
    ['bit', 'BOOLEAN'],
    ['blob', 'BLOB'],
    ['bool', 'BOOLEAN'],
    ['char', 'CHAR'],
    ['date', 'DATEONLY'],
    ['datetime', 'DATE'],
    ['decimal', 'DECIMAL'],
    ['double', 'DOUBLE'],
    ['enum', 'ENUM'],
    ['float', 'FLOAT'],
    ['geometry', 'GEOMETRY'],
    ['int', 'INTEGER'],
    ['json', 'JSON'],
    ['jsonb', 'JSONB'],
    ['mediumint', 'MEDIUMINT'],
    ['ntext', 'TEXT'],
    ['numeric', 'NUMBER'],
    ['real', 'REAL'],
    ['set', 'ENUM'],
    ['smallint', 'SMALLINT'],
    ['text', 'TEXT'],
    ['time', 'TIME'],
    ['timestamp', 'TIME'],
    ['tinyblob', 'BLOB'],
    ['tinyint', 'TINYINT'],
    ['tinytext', 'TEXT'],
    ['uniqueidentifier', 'UUID'],
    ['uuid', 'UUID'],
    ['varbinary', 'BLOB'],
    ['varchar', 'CHAR'],
    ['year', 'INTEGER'],
  ])

  protected mapExtraColumnDescription(description: ColumnDescription): MySqlColumnDescriptionExtra {
    const extraDescription: MySqlColumnDescriptionExtra = {
      unsigned: undefined,
      enumEntries: undefined,
      precision: undefined,
      decimals: undefined,
      scale: undefined,
      length: undefined,
      unique: undefined,
      reference: undefined,
      dbType: 'int',
    }

    forEach(this.extraAttributesByRegex, ([ typeRegex, propNames ]) => {
      const schemaType = description.type.toLowerCase().trim()
      if (!typeRegex.test(schemaType)) return

      const execValues = typeRegex.exec(schemaType)
      if (!execValues) return

      const plainValues = drop(execValues.filter(isString), 1) as MySqlColumnType[]

      forEach(plainValues, (value, index) => {
        if (isNull(value)) return

        const prop = propNames[index]

        switch (prop) {
          case 'unsigned': {
            extraDescription.unsigned = true
            break
          }
          case 'enumEntries': {
            extraDescription.enumEntries = value.split(',').map(this.unquote)
            break
          }
          case 'precision':
          case 'scale':
          case 'decimals': {
            extraDescription[prop] = Number(value)
            break
          }
          case 'length': {
            extraDescription.length = isFinite(Number(value)) ? Number(value) : value
            break
          }
          case 'dbType': {
            extraDescription.dbType = value
            break
          }
          default: {
            throw Error(`Unsupported property ${prop}`)
          }
        }
      })

      return false
    })

    return extraDescription
  }
}

type MySqlColumnType =
  'bigint' |
  'binary' |
  'bit' |
  'blob' |
  'bool' |
  'char' |
  'date' |
  'datetime' |
  'decimal' |
  'double' |
  'enum' |
  'float' |
  'geometry' |
  'int' |
  'json' |
  'jsonb' |
  'longblob' |
  'longtext' |
  'mediumblob' |
  'mediumint' |
  'mediumtext' |
  'ntext' |
  'numeric' |
  'real' |
  'set' |
  'smallint' |
  'text' |
  'time' |
  'timestamp' |
  'tinyblob' |
  'tinyint' |
  'tinytext' |
  'uniqueidentifier' |
  'uuid' |
  'varbinary' |
  'varchar' |
  'year'

// type MySqlTableMetadata = TableMetadata<MySqlIndexMetadata[], MySqlForeignKeyReferences[]>

interface MySqlIndexMetadata {
  primary: boolean
  fields: {
    attribute: string
    length: number
    order: string
  }[]
  name: string
  tableName: string
  unique: boolean
  type: 'BTREE'
}

interface MySqlForeignKeyReferences {
  constraintName: string
  constraintSchema: string
  constraintCatalog: string
  tableName: string
  tableSchema: string
  tableCatalog: string
  columnName: string
  referencedTableSchema: string
  referencedTableCatalog: string
  referencedTableName: string
  referencedColumnName: string
}

type MySqlParsedColumnsDescriptionsByTableName = ParsedColumnsDescriptionsByTableName<MySqlColumnDescriptionExtra>

type MySqlParsedColumnDescriptionsByColumnName = ParsedColumnDescriptionsByColumnName<MySqlColumnDescriptionExtra>

type MySqlModelerSettings  = ModelerSettings<MySqlIndexMetadata, MySqlForeignKeyReferences, MySqlColumnDescriptionExtra>

type MySqlJunctionRuleCallback = JunctionRuleCallback<MySqlIndexMetadata, MySqlForeignKeyReferences, MySqlColumnDescriptionExtra>

/**
 * The extra description for each column the Mapper needs to provide, as Sequelize does not
 */
export interface MySqlColumnDescriptionExtra {
  dbType: MySqlColumnType | null
  length?: number | string
  decimals?: number
  precision?: number
  scale?: number
  enumEntries?: string[]
  unique?: boolean | string
  reference?: ParsedColumnReference
  unsigned?: boolean
}
