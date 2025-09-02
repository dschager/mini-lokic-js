import { promises as fs } from 'fs';
import path from 'path';
import { authenticate, } from '@google-cloud/local-auth';
import { google, sheets_v4, drive_v3, forms_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';

import { CONFIG_DIR } from '../config/constants';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/forms.responses.readonly'
];
const TOKEN_PATH = path.join(CONFIG_DIR, 'google', 'token.json');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'google', 'credentials.json');

async function loadSavedCredentialsIfExist(): Promise<JSONClient | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content.toString());
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client: OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content.toString());
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: (client as OAuth2Client).credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function auth() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = (await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  })) as JSONClient;
  if (client.credentials) {
    if (client instanceof google.auth.OAuth2) {
      await saveCredentials(client);
    } else {
      throw new Error('Client is not an instance of OAuth2Client');
    }
  }

  return client;
}

export async function GoogleSheetsService(): Promise<sheets_v4.Sheets> {
  const authClient = await auth() as OAuth2Client;
  return google.sheets({version: 'v4', auth: authClient });
}

export async function GoogleDriveService(): Promise<drive_v3.Drive> {
  const authClient = await auth() as OAuth2Client;
  return google.drive({version: 'v3', auth: authClient });
}

export async function GoogleFormsService(): Promise<forms_v1.Forms> {
  const authClient = await auth() as OAuth2Client;
  return google.forms({ version: 'v1', auth: authClient });
}