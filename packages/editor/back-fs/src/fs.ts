
import * as fs from 'fs';

export const myCopyFile = async (fromPath: string, toPath: string) => {
  await fs.promises.copyFile(fromPath, toPath);
};

export const myReadDir = (directory: string): Promise<string[]> => {
  return new Promise<string[]>((resolve, reject) => {
    fs.readdir(directory, (err, files) => {
      if (err) {
        return reject(err);
      }
      resolve(files);
    })
  });
};

export const myIsDirectory = (path: string): Promise<boolean> => {
  return new Promise<boolean>((resolve, reject) => {
    fs.stat(path, (err, stat) => {
      if (err) return reject(err);
      resolve(stat.isDirectory());
    });
  });
};

export const myReadFile = (path: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) return reject(err);
      resolve(data.toString());
    })
  });
};

export const myWriteFile = async (path: string, contents: string): Promise<void> => {
  try {
    //console.log('write', { path, contents });
    try {
      await fs.promises.writeFile(path, contents);
    } catch (err) {
      await myDeleteFile(path);
      await fs.promises.writeFile(path, contents);
    }

  } catch (err: any) {
    if (process.platform !== "win32" || err.errno !== -4048 || !fs.existsSync(path)) {
      throw err;
    }
    console.error(err);
    console.log('cacthed');
  }
};

export const myRename = async (oldFile: string, newFile: string): Promise<void> => {
  try {
    await fs.promises.rename(oldFile, newFile);
  } catch (err: any) {
    if (process.platform !== "win32" || err.errno !== -4048 || !fs.existsSync(newFile)) {
      throw err;
    }
    console.error(err);
    console.log('cacthed');
  }
}

export const myDeleteFile = (path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) return reject(err);
      resolve();
    })
  });
};

export const myCreateDirectory = async (directotyPath: string): Promise<void> => {  
  await fs.promises.mkdir(directotyPath, {
    recursive: true
  });
};

export const myFileExists = async (filePath: string): Promise<boolean> => {
  try {
    await myIsDirectory(filePath);
    return true;
  } catch (err) {
    return false;
  }
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.stat(filePath);
    return true;
  } catch (err) {
    return false;
  }
}
