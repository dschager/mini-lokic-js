import "dotenv/config";
import mysql from "mysql2/promise";

interface IMysqlServiceOptions {
    user?: string;
    password?: string;
    pool?: number;
}

export function MysqlService(
    host: string,
    database: string,
    options: IMysqlServiceOptions = {}
): mysql.Pool {
    let user: string, password: string;

    if (options.user === undefined && options.password === undefined) {
        if (process.env.MYSQL_USER === undefined || process.env.MYSQL_PASSWORD === undefined) {
            throw new Error(".env file is not loaded or loaded incorrectly");
        }

        user = process.env.MYSQL_USER;
        password = process.env.MYSQL_PASSWORD;
    } else {
        user = options.user || "";
        password = options.password || "";
    }

    return mysql.createPool({
        host: host,
        database: database,
        user: user,
        password: password,
        waitForConnections: true,
        connectionLimit: options.pool || 10
    });
}
