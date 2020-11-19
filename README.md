# sequelize-modeler

Generates Sequelize models and other boilerplate code by reading your database schema. Fully configurable by using [EJS](https://ejs.co) templates.

<div style="text-align: right; font-size: 16px; font-style: italic;">Do not waste time doing things a machine can do faster, more acurate, or more reliable than you. Use your time to do what a machine cannot. -- <b>Unkown</b></div>

1. Getting started
    1. Config
    2. Run it
    3. The output

2. Support list

3. API
    1. Tooling
    2. Data
    3. (Optional) Preprocessor
    4. How are associations detected?

4. Todos



## Getting started
```sh
npm install sequelize-modeler --save-dev
// or
yarn add sequelize-modeler --dev
```



### Config
Modeler uses Sequelize to read and analyze your database schema. All you need are the [connection settings](https://sequelize.org/master/manual/getting-started.html#connecting-to-a-database) and a template you want to render. Modeler comes with some common templates that you can use directly. If they don't quiet fit you bill, simply use them as a starting point to create you own ones.

```json
{
  "sequelize": { -- the sequelize version 6 connection object
    "username": "root",
    "password": "",
    "database": "foo",
    "host": "127.0.0.1",
    "dialect": "mysql"
  },
  "tables": {
    "include": ["bar"], -- tables you want to feed to your templates. ATTN: [] === no op
    "exclude": [], -- the "I want all but X and Y" scenario
    "templates": [ -- these templates get rendered for each table. See below what data they get.
      "templates/sequelize_V6/model.ts.ejs", -- the output filename can be composed within the template.
      "templates/sequelize_V6/association.ts.ejs"
    ]
  },
  "templates": [ -- these templates get rendered once. See below what data they get.
    "templates/sequelize_V6/index.ts.ejs"
  ]
}
```



### Run it
```sh
npm run modeler
// or
yarn modeler
```
Modeler will create the files right where you run the command and it will give it default names such as `foo-0.js` and `foo-1.js`. To control the output directory and file name, see the `setOutputFileName` function that you can call inside a template.



### The output
```ts
//templates/sequelize_V6/model.ts.ejs -> gen/bar.ts
import {
  ...
} from 'sequelize'

export interface BarAttributes {
  id: string
  foo: number
  createdAt: Date
  modifiedAt: Date
}

export interface BarCreationAttributes extends Optional<BarAttributes, 'modifiedAt'> {}

class Bar extends Sequelize.Model<BarAttributes, BarCreationAttributes> implements BarAttributes {
  public id!: string
  public foo!: number
  public createdAt!: Date
  public modifiedAt!: Date
}

export type BarModel = ModelCtor<Bar> & {
  // static methods go here
}


export function init(sequelize: Sequelize) {
  Bar.init({
    id: {
      field: 'id',
      type: DataTypes.STRING,
      primaryKey: true
    },
    foo: {
      field: 'foo',
      type: DataTypes.INTEGER({
        length: 10
      }),
    },
    createdAt: {
      field: 'created_at',
      type: DataTypes.DATE
    },
    modifiedAt: {
      field: 'modified_at',
      type: DataTypes.DATE,
      allowNull: true
    },
  }, {
    sequelize,
    tableName: 'bar',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  })
}
```



## Support list (available templates)
|             |MySql|MsSql|Postgres|SQLite|MariaDb|
|:------------|:---:|:---:|:---:|:---:|----:|
|Sequelize V4 |  n  |  n  |  n  |  n  |  n  |
|Sequelize V5 |  n  |  n  |  n  |  n  |  n  |
|Sequelize V6 |  Y  |  n  |  n  |  n  |  Y  |

If your database is not supported, extend the abstract `SchemaMapper` class. If your ORM is not supported, write a template for it. Either way, you will support developers by reducing mindless work, preventing bugs, and just being more happy! So please, submit a pull request ;)




## API



### Tooling
Inside a template, you have access to a few useful functions and objects

- ```ts
  setOutputFileName(fileName: string) => void
  ```

  Changes the output filename from the default of `[tableName]-[index].ts`.

  Example:
  ```ts
  setOutputFileName(`${table.name}-${new Date()}.js`)
  ```

- ```ts
  skipFile() => void
  ``` 

  If you find that some criteria matches the table or column names, for example, you can dynamically skip rendering the template

- ```ts
  changeCase: object
  ```
  
  this [awesome package](https://github.com/blakeembrey/change-case/tree/master/packages/camel-case#readme) to change casing of strings

- ```ts
  _: object
  ```
  
  Lodash version 4



### Data
The data you recieve inside a template is this:
```ts

// The key of this Map is the table name
const table: Map<string, {
  name: string                // table name
  columns,                    // a Map columns by column names
  isJunctionTable: boolean    // if the table is determined to be a many-to-many junction table
  associations: Association[] // associations to other models
}>

// The key of this Map is the column name
const columns: Map<string, {
  type: string
  allowNull: boolean
  defaultValue: string
  primaryKey: boolean
  autoIncrement: boolean
  comment: string | null
  dbType: MySqlColumnType | null
  length?: number | string
  decimals?: number
  precision?: number
  scale?: number
  enumEntries?: string[]
  unique?: boolean | string
  reference?: {
    tableName: string
    key: string
  }
  unsigned?: boolean
}>

const associations: Association: {
  associationType: 'belongsTo' | 'hasMany' | 'belongsToMany' | 'hasOne'
  source: string
  target: string
  foreignKey: string
  through?: string
  otherKey?: string
  onDelete?: string
  onUpdate?: string
}

type MySqlColumnType =
  'bigint' | 'binary' | 'bit' | 'blob' | 'bool' | 'char' | 'date' | 'datetime' | 'decimal' | 'double' | 'enum' |
  'float' | 'geometry' | 'int' | 'json' | 'jsonb' | 'longblob' | 'longtext' | 'mediumblob' | 'mediumint' |
  'mediumtext' | 'ntext' | 'numeric' | 'real' | 'set' | 'smallint' | 'text' | 'time' | 'timestamp' | 'tinyblob' |
  'tinyint' | 'tinytext' | 'uniqueidentifier' | 'uuid' | 'varbinary' | 'varchar' | 'year'

```

### (Optional) Preprocessor
A preprocessor can be used to prepare the data before it gets rendered by the template. This is useful if:
- a dependency is required to render the template
- some async action is required to render the template
- a lot of data preparation code convolutes the template making it hard to read

Each template can have it's own preprocessor by adding the `preprocessor` option to the template configuration:
```ts
// modeler.config.json
{
  "tables": {
    "templates": [
      "local/path/simpleTemplate.ejs",
      {
        "template": "local/path/complexTemplate.ejs",
        "preprocessor": "local/path/complexTemplatePreprocessor.js"
      }
    ]
  }
}
```

The preprocessor is a simple JavaScript function that accepts a single `data` object and returns whatever data is needed to render the template. Note that any dependency needs to be loaded from your projects `node_modules` folder, not from Modeler's dependencies where the preprocessor module is actually loaded. Here an example assuming that you have installed the `inflection` dependency in your project: 
```ts
const path = require('path') // any node dependency can be loaded from Modeler

const requireLocal = (dep) => require(path.resolve(process.cwd(), 'node_modules', dep))

const inflection = requireLocal('inflection') // dependencies of your project need to be resolved like so

module.exports = async function(data /* the data object created by Modeler */) {
  const { table, changeCase } = data

  return {
    // in most cases you probably want to add some properties to the data object, rather than replacing it
    modelNamePlural: inflection.pluralize(changeCase.pascalCase(table.name)),
    ...data
  }
}
```

### How are associations detected?
Associations are the Sequelize equivalent of MySql foreign key relationships. You can find more details about them [here](https://sequelize.org/master/manual/assocs.html).
Modeler tries to guess the relation of 2 models by examining the foreign key relationships. In the below list, the source model is the one you put the assiociation on and the target model is the one you assiciate it with. These are the 4 types (from the perspective of a source model):

 - **belongsTo**: The foreign key is on the source model.

   Target model association: *hasMany* or *hasOne*

 - **belongsToMany**: There are 2 foreign keys on a [junction table](https://en.wikipedia.org/wiki/Associative_entity) and those keys are also constrained by a composite unique index (a primary index is always also a unique index). The junction table gets a *belongsTo* association to both, the source and the target model.

   Target model association: *belongsToMany*

 - **hasOne**: The foreign key is on the target model and there is a unique (non-composite) index on the foreign key.

   Target model association: *belongsTo*

 - **hasMany**: The foreign key is on the target model and there is no unique index on the foreign key.

   Target model association: *belongsTo*



## Todos
 - associations onDeleted/onUpdated
 - parameterize CLI
 - add tests
