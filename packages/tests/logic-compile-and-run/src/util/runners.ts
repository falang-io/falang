import 'reflect-metadata';
import * as path from 'path';
import * as fs1 from 'fs';
const fs = fs1.promises;
import { spawn } from 'child_process';

const START_TEXT = '!!test started';

interface IRunScriptParams {
  cwd: string
  command: string
  args: string[]
  disableFindIndex?: boolean
}

const TIME_LIMIT = 60000;

const runScript = ({ cwd, command, args, disableFindIndex }: IRunScriptParams): Promise<string[]> => {
  return new Promise<string[]>((resolve, reject) => {
    const totalStrings: string[] = [];

    //kick off process of listing files
    var child = spawn(command, args, { cwd });

    //spit stdout to screen
    child.stdout.on('data', (data) => {
      const str = String(data);
      process.stdout.write(str);
      totalStrings.push(str);
    });

    //spit stderr to screen
    child.stderr.on('data', function (data) {
      const str = String(data);
      process.stderr.write(str);
    });

    const closeTimeout = setTimeout(() => {
      process.stderr.write('Process timeout');
      process.exit(1);
    }, TIME_LIMIT);

    child.on('close', function (code) {
      clearTimeout(closeTimeout);
      if(code !== 0) {
        return reject(new Error(`End with code: ${code}`));
      }
      if(disableFindIndex) {
        return resolve([]);
      }
      const returnValue = totalStrings.join('');
      const startTextIndex = returnValue.indexOf(START_TEXT);
      if (startTextIndex === -1) {
        return reject(new Error(`Start index not found:\n${returnValue}`));
      }
      const newLineIndex = returnValue.indexOf('\n', startTextIndex);
      const realReturnValue = returnValue.slice(newLineIndex + 1);
      const returnStrings = realReturnValue.split('\n');
      resolve(returnStrings);
    });
  });
}

const runTypescript = async (codeDir: string): Promise<string[]> => {

  const codeProjectPath = path.resolve(codeDir, 'ts');

  return runScript({
    command: 'npm',
    args: ['start'],
    cwd: codeProjectPath,
  });
};

const runJavascript = async (codeDir: string): Promise<string[]> => {
  const codeProjectPath = path.resolve(codeDir, 'js');
  return runScript({
    command: 'npm',
    args: ['start'],
    cwd: codeProjectPath,
  });
};


const runJavascriptFile = async (codeDir: string): Promise<string[]> => {

  const codeProjectPath = path.resolve(codeDir, 'js-file/src');
  return runScript({
    command: 'node',
    args: ['index'],
    cwd: codeProjectPath,
  });
};

const runRust = async (codeDir: string): Promise<string[]> => {
  const codeProjectPath = path.resolve(codeDir, 'rust');
  return runScript({
    command: 'cargo',
    args: ['run', '-q', '-r'],
    cwd: codeProjectPath,
  });
};

const runCpp = async (codeDir: string): Promise<string[]> => {
  const codeProjectPath = path.resolve(codeDir, 'cpp');
  await runScript({
    command: 'cmake',
    args: ['./'],
    cwd: codeProjectPath,
    disableFindIndex: true,
  });
  await runScript({
    command: 'cmake',
    args: ['--build','./'],
    cwd: codeProjectPath,
    disableFindIndex: true,
  });
  return runScript({
    command: './main',
    args: [],
    cwd: codeProjectPath,
  });
};

const runSharp = async (codeDir: string): Promise<string[]> => {
  const codeProjectPath = path.resolve(codeDir, 'sharp');
  return runScript({
    command: 'dotnet',
    args: ['run'],
    cwd: codeProjectPath,
  });
};

const runGolang = async (codeDir: string): Promise<string[]> => {

  const codeProjectPath = path.resolve(codeDir, 'go');
  return (await runScript({
    command: 'go',
    args: ['run', './main.go'],
    cwd: codeProjectPath,
  })).map((s) => (s.startsWith('[') && s.endsWith(']')) ? s.substring(1, s.length - 1) : s);
};


interface ITestLanguageRunner {
  alias: string
  name: string
  handler: (codeDir: string) => Promise<string[]>
}

export const runners: ITestLanguageRunner[] = [{
  alias: 'ts',
  name: 'TypeScript',
  handler: runTypescript,
}, {
  alias: 'js',
  name: 'JavaScript',
  handler: runJavascript,
}, {
  alias: 'rust',
  name: 'Rust',
  handler: runRust,
}, {
  alias: 'cpp',
  name: 'Cpp',
  handler: runCpp,
}, {
  alias: 'sharp',
  name: 'C#',
  handler: runSharp,
}, {
  alias: 'go',
  name: 'Golang',
  handler: runGolang,
}, {
  alias: 'js-file',
  name: 'JavaScript in file',
  handler: runJavascriptFile,
}];