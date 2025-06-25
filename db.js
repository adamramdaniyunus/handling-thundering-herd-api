const { Pool } = require('pg');

const pool = new Pool({
    user: 'adamramdaniyunus',
    host: 'localhost',
    database: 'big_data_api',
    password: '',
    port: 5432,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
}