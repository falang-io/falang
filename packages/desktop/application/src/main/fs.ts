
import * as path from 'path';
import { app } from 'electron'
import { myCreateDirectory, myFileExists, myReadFile, myWriteFile } from '@falang/back-fs';

export const getConfigDir = async(): Promise<string> => {
  const configPath = path.resolve(app.getPath('userData'), 'Falang');
  const isExists = await myFileExists(configPath);
  if(!isExists) {
    await myCreateDirectory(configPath);
  }
  return configPath;
}

export const getConfigFilePath = async(): Promise<string> => {
  const configDir = await getConfigDir();
  return path.resolve(configDir, 'config.json');
}

export const saveConfig = async(configContents: string) => {
  const configFilePath = await getConfigFilePath();
  await myWriteFile(configFilePath, configContents);
}

export const readConfig = async(): Promise<string> => {  
  try {
    const configFilePath = await getConfigFilePath();
    return await myReadFile(configFilePath);
  } catch (err) {
    return "{}";
  }
}
