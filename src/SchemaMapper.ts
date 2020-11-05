import {
  camelCase,
  includes,
  isEmpty
} from 'lodash'
import {
  ColumnDescription,
  ColumnsDescription,
  Sequelize
} from 'sequelize'

export abstract class SchemaMapper<
  IndexMetadata extends object = {},
  ForeignKeyMetadata extends object = {},
  ColumnDescriptionExtra extends object = {}
> {
  protected tableSchemasByName: TableSchemasByTableName<IndexMetadata, ForeignKeyMetadata> = new Map()

  constructor(protected sequelize: Sequelize) {
  }

  /**
   * The method that any dialect-specific mapper needs to implement. It maps the table schema input provided by sequelize
   * to the parsed column descriptions that templates can access.
   */
  public abstract async mapSchema(tableNames: string[]): Promise<
    ParsedColumnsDescriptionsByTableName<ColumnDescriptionExtra>>


  protected async getTableSchemas(tableNames: string[]): Promise<void> {
    const queryInterface = this.sequelize.getQueryInterface()

    await Promise.all(tableNames.map(async (tableName) => {
      this.tableSchemasByName.set(tableName, {
        columnsDescription: await queryInterface.describeTable(tableName),
        indexes: (await queryInterface.showIndex(tableName)) as any,
        foreignKeyReferences: (await queryInterface.getForeignKeyReferencesForTable(tableName)) as any
      })
    }))

    this.sequelize.close()
  }

  protected unquote(input: string) {
    if (isEmpty(input)) return input

    return includes(['\'\'', '""'], input.slice(0, 1) + input.slice(-1)) ? input.slice(1, -1) : input
  }

  protected plural(input: string) {
    return `${camelCase(input)}s`
  }
}

/**
 * The metadata that Sequelize provides as input for all tables
 *
 * @param IndexMetadata The specific index metadata for the dialect that `sequelize.getQueryInterface().showIndex()` returns
 * @param ForeignKeyMetadata The specific foreign key metadata for the dialect that `sequelize.getQueryInterface().getForeignKeyReferencesForTable()` returns
 */
export type TableSchemasByTableName<
  IndexMetadata extends object = {},
  ForeignKeyMetadata extends object = {}
> = Map<string, TableMetadata<IndexMetadata, ForeignKeyMetadata>>

/**
 * The metadata that Sequelize provides as input for one table
 *
 * @param IndexMetadata The specific index metadata for the dialect that `sequelize.getQueryInterface().showIndex()` returns
 * @param ForeignKeyMetadata The specific foreign key metadata for the dialect that `sequelize.getQueryInterface().getForeignKeyReferencesForTable()` returns
 */
export interface TableMetadata<
  IndexMetadata extends object = {},
  ForeignKeyMetadata extends object= {}
> {
  columnsDescription: ColumnsDescription
  indexes: IndexMetadata
  foreignKeyReferences: ForeignKeyMetadata
}

/**
 * All column descriptions generated from parsing the input of all tables
 */
export type ParsedColumnsDescriptionsByTableName<ColumnDescriptionExtra = {}> = Map<string, {
  name: string
  columns: ParsedColumnDescriptionsByColumnName<ColumnDescriptionExtra>
  isJunctionTable: boolean
  associations: Association[]
}>

/**
 * All column descriptions generated from parsing the input of one tables
 */
export type ParsedColumnDescriptionsByColumnName<ColumnDescriptionExtra = {}> =
  Map<string, ParsedColumnDescription<ColumnDescriptionExtra>>

export enum AssociationType {
  belongsTo = 'belongsTo',
  belongsToMany = 'belongsToMany',
  hasOne = 'hasOne',
  hasMany = 'hasMany',
}

export type Association = {
  associationType: AssociationType
  source: string
  target: string
  foreignKey: string
  targetKey?: string
  through?: string
  otherKey?: string
  onDelete?: string
  onUpdate?: string
}

/**
 * The column description output generated from parsing the input of one column
 * @param ColumnDescriptionExtra any extra dialect-specig column description
 */
export type ParsedColumnDescription<ColumnDescriptionExtra = {}> = 
  ColumnDescription & EssentialColumnDescription & ColumnDescriptionExtra

export type EssentialColumnDescription = {
  ormType: string | null
  tsType: string | null
}

/**
 * The column references output generated from parsing all input foreign key references of one table
 */
export type ParsedColumnReference = {
  tableName: string
  key: string
}
