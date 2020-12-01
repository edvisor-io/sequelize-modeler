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
Modeler uses Sequelize to read and analyze your database schema. All you need are the [connection settings](https://sequelize.org/master/manual/getting-started.html#connecting-to-a-database) and a template you want to render. Modeler comes with some common templates that you can use directly. If they don't quiet fit you bill, simply use them as a starting point to create your own ones.

```ts
// modeler.config.json
{
  // REQUIRED: the sequelize version 6 connection object
  "sequelize": { 
    "username": "root",
    "password": "",
    "database": "foo",
    "host": "127.0.0.1",
    "dialect": "mysql"
  },
  "tables": {
    // List the tables you want to feed to your templates, aka a white-list. (Note: [] == include nothing)
    "include": ["bar"],
    // A black-list for the "I want all tables but X and Y" scenario
    "exclude": [],
    // The templates you list here get rendered for each table. See below what data they get.
    "templates": [ 
      // EITHER provide a local template file.
      "templates/sequelize_V6/model.ts.ejs",
      // OR provide a configuration object for more advanced options
      {
        "template": "local/path/complexTemplate.ejs",
        // An optional JS function to pre-process your data. See below for details.
        "preprocessor": "local/path/complexTemplatePreprocessor.js",
        // Overwrite exisiting files. Default: `true`
        "overwrite": false
      }
    ]
  },
  // these templates get rendered once and the same options as above are supported. See below what data they get.
  "templates": [
    "templates/sequelize_V6/index.ts.ejs"
  ],
  // This is for fine-tuning Modelers ability to identify "junction tables". See below for details.
  "junctionRules": [
    "compositePrimaryOnly", // DEFAULT
    "compositePrimary",
    "primaryAndTimestampOnly",
    {
      "callback": "local/path/myJuntionRuleCallback.js"
    }
  ],
  // This does not create any junction models at all
  "junctionRules": false
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

module.exports = async function({
  sequelize, /* ONLY a preprocessor gets an initialized sequelize object for DB queries (NOT available in a template)*/
  ...data /* the data object created by Modeler */
}) {
  const { table, changeCase } = data

  return {
    // in most cases you probably want to add some properties to the data object, rather than replacing it:
    modelNamePlural: inflection.pluralize(changeCase.pascalCase(table.name)),
    ...data
  }
}
```
interface TemplateConfig {
  template: string
  preprocessor?: string
}

### How are associations detected?
Associations are the Sequelize equivalent of MySql foreign key relationships. You can find more details about them [here](https://sequelize.org/master/manual/assocs.html).
Modeler tries to guess the relation of 2 models by examining the foreign key relationships. In the below list, the source model is the one you put the assiociation on and the target model is the one you assiciate it with. These are the 4 types (from the perspective of a source model):

 - **belongsTo**: The foreign key is on the source model.

   Target model association: *hasMany* or *hasOne*

 - **belongsToMany**: There are 2 foreign keys on a [junction table](https://en.wikipedia.org/wiki/Associative_entity) and those keys are also constrained by a composite unique index (a primary index is always also a unique index). The junction table gets a *belongsTo* association to both, the source and the target model. See below on how junction tables are detected.

   Target model association: *belongsToMany*

 - **hasOne**: The foreign key is on the target model and there is a unique (non-composite) index on the foreign key.

   Target model association: *belongsTo*

 - **hasMany**: The foreign key is on the target model and there is no unique index on the foreign key.

   Target model association: *belongsTo*


### How are junction tables detected?
Modeler has 3 build-in rules you can chose from and combine, if necessary. If you pick more than one rule, any one matching
rule will identify a table as a junction table (rules are ORed together). These are the build-in rules:

- **compositePrimaryOnly**: This is the default. If, and only if the table has exactly 2 columns and they form a composite primary
key and also refer to 2 other tables, Modeler will identify the table as a junction table. Example:
```sql
CREATE TABLE `student_teacher` (
  `student_id` int(10) unsigned NOT NULL,
  `teacher_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`student_id`,`teacher_id`),
  CONSTRAINT `fk1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk2` FOREIGN KEY (`teacher_id`) REFERENCES `teacher` (`teacher_id`) ON DELETE CASCADE ON UPDATE NO ACTION
)
```
- **compositePrimary**: This is a more relaxed rule of the above. It allows to have any other column, but the composite primary
key is still required. Example:
```sql
CREATE TABLE `student_teacher` (
  `student_id` int(10) unsigned NOT NULL,
  `teacher_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`student_id`,`teacher_id`),
  CONSTRAINT `fk1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk2` FOREIGN KEY (`teacher_id`) REFERENCES `teacher` (`teacher_id`) ON DELETE CASCADE ON UPDATE NO ACTION
)
```
- **primaryAndTimestampOnly**: This rule requires a table to have any 2 foreign key relations. Other columns, however, can only
be primary key or timestamp columns. Example:
```sql
CREATE TABLE `student_teacher` (
  `student_teacher_id` int(10) unsigned NOT NULL,
  `student_id` int(10) unsigned NOT NULL,
  `teacher_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`student_teacher_id`),
  CONSTRAINT `fk1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk2` FOREIGN KEY (`teacher_id`) REFERENCES `teacher` (`teacher_id`) ON DELETE CASCADE ON UPDATE NO ACTION
)
```
- **custom callback**: It is also possible to provide a custom callback that is called for every table. It gets the entire
schema and the column descriptions of the table in question as a parameter. The funciton should return a boolean to indicate
if the table is a junction table.
```ts
// local/path/myJunctionCallback.js
module.exports = async function (
  schema, // TableMetadata<IndexMetadata[], ForeignKeyMetadata[]>,
  cols // ParsedColumnDescriptionsByColumnName<ColumnDescriptionExtra>,
) => Promise<boolean>
```

## Todos
 - associations onDeleted/onUpdated
 - parameterize CLI
 - add tests
