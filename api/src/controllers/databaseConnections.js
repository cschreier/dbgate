const fp = require('lodash/fp');
const connections = require('./connections');
const socket = require('../utility/socket');
const { fork } = require('child_process');
const DatabaseAnalyser = require('../engines/default/DatabaseAnalyser')

module.exports = {
  /** @type {import('../types').OpenedDatabaseConnection[]} */
  opened: [],

  handle_structure(id, database, { structure }) {
    const existing = this.opened.find(x => x.id == id && x.database == database);
    if (!existing) return;
    existing.structure = structure;
    socket.emit(`database-structure-changed-${id}-${database}`);
  },
  handle_error(id, { error }) {
    console.log(error);
  },

  async ensureOpened(id, database) {
    const existing = this.opened.find(x => x.id == id && x.database == database);
    if (existing) return existing;
    const connection = await connections.get({ id });
    const subprocess = fork(`${__dirname}/../proc/databaseConnectionProcess.js`);
    const newOpened = {
      id,
      database,
      subprocess,
      structure: DatabaseAnalyser.createEmptyStructure(),
      connection,
    };
    this.opened.push(newOpened);
    // @ts-ignore
    subprocess.on('message', ({ msgtype, ...message }) => {
      this[`handle_${msgtype}`](id, database, message);
    });
    subprocess.send({ msgtype: 'connect', ...connection, database });
    return newOpened;
  },

  listTables_meta: 'get',
  async listTables({ id, database }) {
    const opened = await this.ensureOpened(id, database);
    return opened.structure.tables; // .map(fp.pick(['tableName', 'schemaName']));
  },
};
