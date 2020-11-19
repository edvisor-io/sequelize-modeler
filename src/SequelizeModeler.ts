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
      tables: { templates: templateNamesOrConfigs },
      sequelize : { dialect }
    } = this.modelerConfig
    if (!dialect) throw new Error('No sequelize.dialect provided in config.')

    const Mapper = this.mappersByDialect.get(dialect)
    if (!Mapper) throw new Error(`Dialect not supported. Why not implement a Mapper class! (see README)`)

    const mapper = new Mapper(this.sequelize)
    const tableDefByTableName = await mapper.mapSchema(await this.filterTables())

    if (!!templateNamesOrConfigs && templateNamesOrConfigs.length > 0) {
      tableDefByTableName.forEach(async (table, tableName) => {
        await this.processTemplates(templateNamesOrConfigs, { table }, tableName)
      })
    }

    if (!!rootTemplates) {
      await this.processTemplates(rootTemplates, { tables: tableDefByTableName }, 'index')
    }
  }

  protected async processTemplates(
    templateNamesOrConfigs: (string | TemplateConfig)[],
    renderData: object,
    defaultFileName: string,
    defaultFileEnding: 'js' | 'ts' = 'ts'
  ) {
    return Promise.all(templateNamesOrConfigs.map(async (templateNameOrConfig, templateIndex) => {
      const localParams = {
        outputFileName: `${defaultFileName}-${templateIndex}${defaultFileEnding}`,
        skipFile: false
      }
      const setOutputFileName = (overwriteFileName: string) => { localParams.outputFileName = overwriteFileName }
      const skipFile = () => { localParams.skipFile = true }
      let data = {
        ...renderData,
        setOutputFileName,
        skipFile,
        changeCase,
        _
      }

      const templateFileName = (typeof templateNameOrConfig === 'string') ? templateNameOrConfig : templateNameOrConfig.template
      if (typeof templateNameOrConfig === 'object') {
        if (templateNameOrConfig.preprocessor) {
          const preprocessor: ((data: object) => object) | unknown = require(
            path.resolve(this.cwd, templateNameOrConfig.preprocessor))
          if (typeof preprocessor !== 'function') {
            console.warn('No preprocessor found. Needs to be a default exported function. Skipping preprocessing. ' + templateNameOrConfig.preprocessor)
          } else {
            data = {
              ...await preprocessor(data)
            }
          }
        }
      }

      const modelDefTemplate = await ejs.renderFile(path.resolve(this.cwd, templateFileName), data)

      if (localParams.skipFile) return

      const outputPath = path.join(this.cwd, localParams.outputFileName)
      const outputDir = path.dirname(outputPath)

      if (!fs.existsSync(outputDir)) {
        await this.mkdir(outputDir, { recursive: true })
      }
      return this.writeFile(outputPath, modelDefTemplate)
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
  protected mkdir = promisify(fs.mkdir)
}

interface ModelerConfig {
  sequelize: Options
  tables: {
    include?: string[]
    exclude?: string[]
    templates?: (string | TemplateConfig)[]
  }
  templates?: string[]
}

interface TemplateConfig {
  template: string
  preprocessor?: string
}