// 앱 전체가 공유하는 Knex 인스턴스 하나를 만든다.
// 모든 *.repository.js는 `require('../db/connection')` 한 줄로 DB에 접근한다.
// (React 앱에서 axios 인스턴스를 하나 만들어 공유하는 것과 비슷한 역할)

const knex = require('knex');
const config = require('../../knexfile');

const env = process.env.NODE_ENV || 'development';

module.exports = knex(config[env]);
