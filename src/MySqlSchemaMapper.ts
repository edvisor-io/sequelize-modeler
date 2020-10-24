import {
  chain,
  drop,
  forEach,
  forOwn,
  includes,
  isNull,
  isNumber,
  isString,
} from 'lodash'
import {
  ColumnDescription,
  Sequelize
} from 'sequelize/types'

import {
  EssentialColumnDescription,
  ParsedColumnDescription,
  ParsedColumnDescriptionsByColumnName,
  ParsedColumnReference,
  ParsedColumnsDescriptionsByTableName,
  SchemaMapper,
  TableMetadata
} from './SchemaMapper'

export class MySqlSchemaMapper extends SchemaMapper<
  MySqlIndexMetadata[],
  MySqlForeignKeyReferences[],
  MySqlColumnDescriptionExtra
> {
  constructor(sequelize: Sequelize) {
    super(sequelize)
  }

  public async mapSchema(tableNames: string[]) {
    await this.getTableSchemas(tableNames)

    const parsedColumnsDescriptionsByTableName: MySqlParsedColumnsDescriptionsByTableName = new Map()

    this.tableSchemasByName.forEach((schema, tableName) => {
      const parsedDescriptionsByColumnName: MySqlParsedColumnDescriptionsByColumnName = new Map()
      const uniqueColumns = chain(schema.indexes)
        .filter((index) => index.unique && !index.primary)
        .reduce((columnNames, index) => {
          columnNames.push(...index.fields.map((field) => field.attribute))
          return columnNames
        }, [] as string[])
        .value()


      forOwn(schema.columnsDescription, (description, columnName) => {
        const descriptionExtras = this.mapExtraColumnDescription(description)
        const { dbType } = descriptionExtras
        const essentialDescription: EssentialColumnDescription = {
          tsType: dbType ? (MySqlSchemaMapper.tsTypesByDbType.get(dbType) || null) : null,
          ormType: dbType ? (MySqlSchemaMapper.ormTypesByDbType.get(dbType) || null) : null
        }

        parsedDescriptionsByColumnName.set(columnName, {
          ...description,
          ...essentialDescription,
          ...descriptionExtras,
          unique: includes(uniqueColumns, columnName),
          reference: this.getReference(schema, columnName)
        })
      })

      parsedColumnsDescriptionsByTableName.set(tableName, {
        name: tableName,
        columns: parsedDescriptionsByColumnName
      })
    })

    return parsedColumnsDescriptionsByTableName
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
    ['enum', 'string[]'],
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
    ['set', 'string[]'],
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

      // if (propNames.length < plainValues.length) throw new Error(
      //   `Inproper mapping. Regex: ${typeRegex.toString()}, properties: ${propNames.join(', ')}`)

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

  // private isUniqe(
  //   schema: MySqlTableMetadata,
  //   columnName: string
  // ): boolean {
  // }

  private getReference(
    schema: MySqlTableMetadata,
    columnName: string
  ): ParsedColumnReference {
    return schema.foreignKeyReferences.reduce((ref, curr) => {
      if (curr.columnName === columnName) {
        ref.tableName = curr.referencedTableName,
        ref.key = curr.referencedColumnName
      }
      return ref
    }, {} as ParsedColumnReference)
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

type MySqlTableMetadata = TableMetadata<MySqlIndexMetadata[], MySqlForeignKeyReferences[]>

interface MySqlIndexMetadata {
  primary: boolean
  fields: {
    attribute: string
    length: number
    order: string
  } []
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

/**
 * 
 */
export interface MySqlColumnDescriptionExtra {
  dbType: MySqlColumnType | null
  length?: number | string
  decimals?: number
  precision?: number
  scale?: number
  enumEntries?: string[]
  unique?: boolean
  reference?: ParsedColumnReference
  unsigned?: boolean
}
