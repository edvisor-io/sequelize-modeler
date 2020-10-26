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
    "exclude": [], -- the "I want all by X and Y" scenario
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

- `setOutputFileName(fileName: string) => void`

  Changes the output filename from the default.

  Example:
  ```ts
  setOutputFileName(`${table.name}-${new Date()}.js`)
  ```

- `skipFile() => void` 

  If you find that some criteria matches the table or column names, for example, you can dynamically skip rendering the template

- `changeCase` this [awesome package]() to change casing of strings

- `_` Lodash version 4

### Data
The data you recieve inside a template is either column data per table, or data of all columns by table.
```ts
// a template per table gets this data
const columns: Map<string, { // mapped by column name
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
  unique?: boolean
  reference?: {
    tableName: string
    key: string
  }
  unsigned?: boolean
}>

// a template for all tables gets this data
const table :Map<string, { // mapped by table name
  name: string
  columns,
}>

//TODO
const associations: {
  associationType: 'belongsTo' | 'hasMany' | 'belongsToMany' | 'hasOne'
  source: string
  target: string
  as: string
  foreignKey: string
  through?: string
  otherKey?: string
  onDelete?: string
  onUpdate?: string
}[]

```


## Todos
 - associations belongsTo, belongsToMany, hasOne
 - tests
