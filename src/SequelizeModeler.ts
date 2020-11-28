import * as changeCase from 'change-case'
import ejs from 'ejs'
import * as fs from 'fs'
import _, {
  difference,
  find,
  includes,
  intersection,
  isNil,
  isString,
} from 'lodash'
import * as path from 'path'
import {
  Dialect,
  Options,
  Sequelize
} from 'sequelize'
import { promisify } from 'util'

import { MySqlSchemaMapper } from './MySqlSchemaMapper'
import { JunctionRuleCallback } from './SchemaMapper'


export class SequelizeModeler {
  protected sequelize: Sequelize
  protected modelerConfig: ModelerConfig
  protected settings: ModelerSettings
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
      const configFile: ModelerConfig | undefined = require(path.resolve(this.cwd, configFileName))
      if (!configFile) throw new Error(`${configFileName} not found`)

      this.sequelize = new Sequelize(configFile.sequelize)
      this.modelerConfig = configFile
    } else {
      this.sequelize = new Sequelize(config.sequelize)
      this.modelerConfig = config
    }

    this.settings = this.createSettings()
  }

  protected createSettings(): ModelerSettings {
    const {
      junctionRules: rawJunctionRules,
      templates: rawRootTemplates,
      tables: { templates: rawTemplates },
      sequelize : { dialect }
    } = this.modelerConfig

    if (!dialect) throw new Error('No sequelize.dialect provided in config.')

    let junctionRuleCallback = undefined
    let junctionRules: JunctionRule[] = []
    if (isNil(rawJunctionRules)) {
      junctionRules = [JunctionRule.DEFAULT]
    } else if (rawJunctionRules === true) {
      junctionRules = [JunctionRule.DEFAULT]
    } else if (rawJunctionRules === false) {
        junctionRules = [JunctionRule.OFF]
    } else {
      if (includes(rawJunctionRules, 'compositePrimaryOnly')) {
        junctionRules = [JunctionRule.COMPOSITE_PRIMARY_ONLY]
      }
      if (includes(rawJunctionRules, 'compositePrimary')) {
        junctionRules.push(JunctionRule.COMPOSITE_PRIMARY)
      }
      if (includes(rawJunctionRules, 'primaryAndTimestampOnly')) {
        junctionRules.push(JunctionRule.PRIMARY_AND_TIMESTAMP_ONLY)
      }

      const callbackRule = find(rawJunctionRules,
        rule => (typeof rule === 'object' && isString(rule.callback))) as { callback: string } | undefined
      if (callbackRule) {
        junctionRules.push(JunctionRule.CALLBACK)
        const callbackPath = path.resolve(this.cwd, callbackRule.callback)
        junctionRuleCallback = require(callbackPath)
      }
    }

    const mapToConfig = (templateNamesOrConfigs?: (string | TemplateConfig)[]) => {
      if (!templateNamesOrConfigs) return []

      return templateNamesOrConfigs.map(templateOrConfig => (
        typeof templateOrConfig === 'string' ? {
          template: templateOrConfig
        } : templateOrConfig
      ))
    }

    return {
      dialect,
      junctionRules,
      junctionRuleCallback,
      rootTemplates: mapToConfig(rawRootTemplates),
      templates: mapToConfig(rawTemplates)
    }

  }

  public async run() {
    const Mapper = this.mappersByDialect.get(this.settings.dialect)
    if (!Mapper) throw new Error(`Dialect not supported. Why not implement a Mapper class! (see README)`)

    const mapper = new Mapper(this.sequelize, this.settings)
    const tableDefByTableName = await mapper.mapSchema(await this.filterTables())


    await Promise.all([
      Promise.resolve().then(() => {
        if (!this.settings.templates) return

        return Promise.all(this.settings.templates.map(async (templateConfig, templateIndex) => {
          const preprocessor = this.getPreprocessor(templateConfig)

          tableDefByTableName.forEach(async (table, tableName) => {
            const defaultFileName = `${tableName}-${templateIndex}.ts`

            await this.processTemplates(templateConfig.template, { table }, preprocessor, defaultFileName)
          })
        }))
      }),
      Promise.resolve().then(() => {
        if (!this.settings.rootTemplates) return

        return Promise.all(this.settings.rootTemplates.map(async (templateConfig) => {
          const preprocessor = this.getPreprocessor(templateConfig)

          await this.processTemplates(templateConfig.template, { tables: tableDefByTableName }, preprocessor)
        }))
      })
    ])

    this.sequelize.close()
  }

  protected async processTemplates(
    templateFileName: string,
    renderData: object,
    preprocessor?: (data: object) => Promise<object>,
    defaultOutputFileName: string = templateFileName,
  ) {
    const localParams = {
      outputFileName: defaultOutputFileName,
      skipFile: false
    }
    const setOutputFileName = (overwriteFileName: string) => { localParams.outputFileName = overwriteFileName }
    const skipFile = () => { localParams.skipFile = true }
    const data = {
      ...renderData,
      setOutputFileName,
      skipFile,
      changeCase,
      _
    }

    const modelDefTemplate = await ejs.renderFile(
      path.resolve(this.cwd, templateFileName),
      (!preprocessor) ? data : await preprocessor({...data, sequelize: this.sequelize })
    )

    if (localParams.skipFile) return

    const outputPath = path.resolve(this.cwd, localParams.outputFileName)

    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      await this.mkdir(outputDir, { recursive: true })
    }

    return this.writeFile(outputPath, modelDefTemplate)
  }

  protected getPreprocessor(templateConfig: TemplateConfig) {
    if (!templateConfig.preprocessor) return

    const preprocessorPath = path.resolve(this.cwd, templateConfig.preprocessor)
    const preprocessor: (data: object) => Promise<object> = require(preprocessorPath)

    if (typeof preprocessor !== 'function') {
      console.warn('No preprocessor found. Needs to be `module.export = function() {}`. Skipping preprocessing. '
        + preprocessorPath)

      return
    }

    return preprocessor
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

export enum JunctionRule {
  OFF,
  COMPOSITE_PRIMARY_ONLY,
  COMPOSITE_PRIMARY,
  PRIMARY_AND_TIMESTAMP_ONLY,
  CALLBACK,
  DEFAULT = COMPOSITE_PRIMARY_ONLY
}

interface ModelerConfig {
  sequelize: Options
  junctionRules?: (
    'compositePrimary' |
    'compositePrimaryOnly' |
    'primaryAndTimestampOnly' |
    { callback: string }
  )[] | boolean,
  tables: {
    include?: string[]
    exclude?: string[]
    templates?: (string | TemplateConfig)[]
  }
  templates?: (string | TemplateConfig)[]
}

interface TemplateConfig {
  template: string
  preprocessor?: string
}

export interface ModelerSettings<
  IndexMetadata extends object = {},
  ForeignKeyMetadata extends object= {},
  ColumnDescriptionExtra extends object = {}
> {
  dialect: Dialect
  junctionRules: JunctionRule[]
  junctionRuleCallback?: JunctionRuleCallback<IndexMetadata, ForeignKeyMetadata, ColumnDescriptionExtra>
  rootTemplates?: TemplateConfig[]
  templates?: TemplateConfig[]
}
