import * as changeCase from 'change-case'
import ejs from 'ejs'
import * as fs from 'fs'
import _, {
  difference,
  intersection,
  isNil,
  isString
} from 'lodash'
import * as path from 'path'
import {
  Dialect,
  Options,
  Sequelize
} from 'sequelize'
import { promisify } from 'util'

import { MySqlSchemaMapper } from './MySqlSchemaMapper'

export class SequelizeModeler {
  protected sequelize: Sequelize
  protected modelerConfig: ModelerConfig
  protected cwd: string

  protected mappersByDialect = new Map<Dialect, typeof MySqlSchemaMapper>([
    ['mysql', MySqlSchemaMapper]
  ])

  /**
   * Create a Modeler instance with a `modeler-config.json` in the root directory
   */
  constructor()
  /**
   * Create a Modeler instance by providing a config object
   *
   * @param config Modeler configuration
   */
  constructor(config: ModelerConfig)
  /**
   * Create a Modeler instance by providing a path and file name to a config JSON
   *
   * @param configFileName Modeler JSON configuration file
   */
  constructor(configFileName: string)
  constructor(config?: ModelerConfig | string) {
    this.cwd = process.cwd()

    if (isNil(config) || isString(config)) {
      const configFileName = isString(config) ? config : './modeler-config.json'
      const configFile: ModelerConfig | undefined = require(path.join(this.cwd, configFileName))
      if (!configFile) throw new Error(`${configFileName} not found`)

      this.sequelize = new Sequelize(configFile.sequelize)
      this.modelerConfig = configFile
    } else {
      this.sequelize = new Sequelize(config.sequelize)
      this.modelerConfig = config
    }
  }

  public async run() {
    const {
      templates: rootTemplates,
      tables: { templates: tableTemplates },
      sequelize : { dialect }
    } = this.modelerConfig
    if (!dialect) throw new Error('No sequelize.dialect provided in config.')

    const Mapper = this.mappersByDialect.get(dialect)
    if (!Mapper) throw new Error(`Dialect not supported. Why not implement a Mapper class! (see README)`)

    const mapper = new Mapper(this.sequelize)
    const tableDefByTableName = await mapper.mapSchema(await this.filterTables())

    if (!!tableTemplates) {
      tableDefByTableName.forEach(async (table, tableName) => {
        console.log();
        await this.renderTemplates(tableTemplates, { table }, tableName)
      })
    }

    if (!!rootTemplates) {
      await this.renderTemplates(rootTemplates, { tables: tableDefByTableName }, 'index')
    }
  }

  protected async renderTemplates(
    templates: string[],
    renderData: object,
    defaultFileName: string,
    defaultFileEnding: 'js' | 'ts' = 'ts'
  ) {
    return Promise.all(templates.map(async (template, templateIndex) => {
      const localParams = {
        outputFileName: `${defaultFileName}-${templateIndex}${defaultFileEnding}`,
        skipFile: false
      }
      const setOutputFileName = (overwriteFileName: string) => { localParams.outputFileName = overwriteFileName }
      const skipFile = () => { localParams.skipFile = true }

      const modelDefTemplate = await ejs.renderFile(path.resolve(this.cwd, template), {
        ...renderData,
        setOutputFileName,
        skipFile,
        changeCase,
        _
      })

      if (localParams.skipFile) return

      return this.writeFile(path.join(this.cwd, localParams.outputFileName), modelDefTemplate)
    }))

  }

  protected async filterTables(): Promise<string[]> {
    const queryInterface = this.sequelize.getQueryInterface()
    const allTables = await queryInterface.showAllTables()
    const { include, exclude } = this.modelerConfig.tables

    return !!exclude ?
      difference(
        !!include ?
          intersection(include, allTables) :
          allTables,
      exclude) :
      !!include ?
        intersection(include, allTables) :
        allTables
  }

  protected writeFile = promisify(fs.writeFile)
}

interface ModelerConfig {
  sequelize: Options
  tables: {
    include: string[] | undefined
    exclude: string[] | undefined
    templates: string[] | undefined
  }
  templates: string[] | undefined
}
