import { ISchemeDto } from '@falang/editor-scheme';
import { BlockDto } from '@falang/editor-scheme';
import { IconWithSkewerDto } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { FunctionIconDto } from '@falang/editor-scheme';
import { IfIconDto } from '@falang/editor-scheme';
import { LifegramDto, LifegramFunctionDto } from '@falang/editor-scheme';
import { ParallelDto } from '@falang/editor-scheme';
import { nanoid } from 'nanoid';
import { PROJECT_EXTENSION } from '../constants';
import { IdeStore } from '../Ide.store';
import { ProjectConfigDto2 } from '../project/ProjectConfig.dto';
import { WhileDto } from '@falang/editor-scheme';

export const convert1to2 = async (config: any, path: string, ide: IdeStore): Promise<ProjectConfigDto2> => {
  const newProjectConfig: ProjectConfigDto2 = {
    name: config.name,
    type: config.type === 'sequence' ? 'text' : config.type,
    version: 2,
  }
  const fs = ide.fileSystem;
  const projectPath = await fs.resolvePath(path, `project.${PROJECT_EXTENSION}`);
  await fs.saveFile(projectPath, JSON.stringify(newProjectConfig, undefined, 2));
  const falangPath = await fs.resolvePath(path, 'falang');
  await scanDirAndConvert(newProjectConfig, falangPath, ide);
  return newProjectConfig;
};

const scanDirAndConvert = async (config: ProjectConfigDto2, directory: string, ide: IdeStore) => {
  const fs = ide.fileSystem;
  const dirInfo = await fs.loadDirectory(directory);
  for(const subDirectory of dirInfo.directories) {
    await scanDirAndConvert(config, subDirectory.path, ide);
  }
  for(const file of dirInfo.files) {
    try {
      await convertFile(config, file.path, ide);
    } catch (err) {
      console.error(err);
      throw new Error(`Unable to convert file ${file.path}. ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    }    
  }  
};

const convertFile = async (config: ProjectConfigDto2, filePath: string, ide: IdeStore) => {
  const fs = ide.fileSystem;
  const contents = await fs.loadFile(filePath);
  const data = JSON.parse(contents);
  let type = data.schemeTemplate;
  if(type === 'text_lifegram') {
    type = 'lifegram';
  }
  if(type === 'text') {
    type = 'function';
  }
  const newScheme: ISchemeDto = {
    description: data.description,
    id: nanoid(),
    name: data.name,
    root: convertIcon(config, data.root),
    schemeVersion: 2,
    type,
  };
  await fs.saveFile(filePath, JSON.stringify(newScheme, undefined, 2));
};

const convertIcon = (config: ProjectConfigDto2, obj: any): IconDto => {
  const alias = obj.alias;
  switch(alias) {
    case 'function': {
      const dto: FunctionIconDto = {
        id: nanoid(),
        alias,
        block: getBlockData(obj.header, config),
        children: obj.skewer.children.map((item: any) => convertIcon(config, item)),
        footer: getBlockData(obj.footer, config),
        header: obj.file_header ? getBlockData(obj.file_header, config): {
          width: 16*6,
          text: '',
        },
      }
      return dto;
    };
    case 'lifegram_root': {
      const dto: LifegramDto = {
        id: nanoid(),
        alias: 'lifegram',
        block: getBlockData(obj.header, config),
        finish: {
          alias: 'system',
          block: getBlockData(obj.finish, config),
          children: obj.finish.skewer.children.map((item: any) => convertIcon(config, item)),
          id: nanoid(),
          return: getBlockData(obj.finish.footer, config),
        },
        functions: obj.functions.children.map((item: any) => {
          const fDto: LifegramFunctionDto = {
            alias: 'system',
            block: getBlockData(item, config),
            children: item.skewer.children.map((item: any) => convertIcon(config, item)),
            id: nanoid(),
            returnGaps: item.returns.gaps,
            returns: item.returns.children.map((item: any) => getBlockData(item, config)),
          };
          return fDto;
        }),
        gaps: obj.functions.gaps,
        headerBlock: getEmptyBlock(config)
      };
      return dto;
    };
    case 'action': {
      const dto: IconDto = {
        alias,
        block: getBlockData(obj, config),
        id: nanoid(),
      }
      return dto;
    };
    case 'foreach': {
      const dto: IconWithSkewerDto = {
        id: nanoid(),
        alias,
        block: getBlockData(obj, config),
        children: obj.skewer.children.map((item: any) => convertIcon(config, item))
      }
      return dto;
    };
    case 'if': {
      const dto: IfIconDto = {
        alias,
        id: nanoid(),
        block: getBlockData(obj, config),
        children: obj.variants.children.map((item: any) => {
          const returnValue: IconWithSkewerDto = {
            id: nanoid(),
            alias: 'system',
            block: getBlockData(item, config),
            children: item.children.map((item: any) => convertIcon(config, item))
          }
          if(item.out) {
            returnValue.out = {
              id: nanoid(),
              alias: item.out.alias,
              type: item.out.alias,
              block: getBlockData(item.out, config),
              level: item.out.breakValue ?? item.out.continueValue ?? item.out.returnValue ?? item.out.returnIndex,
            };
          }
          return returnValue;
        }),
        gaps: obj.variants.gaps,
        trueOnRight: !obj.trueIsMain,
      };
      return dto;
    };
    case 'parallel': {
      const dto: ParallelDto = {
        alias,
        id: nanoid(),
        block: { width: 160 },
        children: obj.threads.children.map((item: any) => {
          const returnValue: IconWithSkewerDto = {
            id: nanoid(),
            alias: 'system',
            block: { width: 160 },
            children: item.skewer.children.map((item: any) => convertIcon(config, item))
          }
          if(item.out) {
            returnValue.out = {
              id: nanoid(),
              alias: item.out.alias,
              type: item.out.alias,
              block: getBlockData(item.out, config),
              level: item.out.breakValue ?? item.out.continueValue ?? item.out.returnValue ?? item.out.returnIndex,
            };
          }
          return returnValue;
        }),
        gaps: obj.threads.gaps,
      };
      return dto;
    };
    case 'pseudo-cycle': {
      const dto: IconWithSkewerDto = {
        id: nanoid(),
        alias,
        block: { width: 160 },
        children: obj.skewer.children.map((item: any) => convertIcon(config, item))
      }
      return dto;
    };
    case 'switch': {
      const dto: ParallelDto = {
        alias,
        id: nanoid(),
        block: getBlockData(obj, config),
        children: obj.switches.children.map((item: any) => {
          const returnValue: IconWithSkewerDto = {
            id: nanoid(),
            alias: 'system',
            block: getBlockData(item, config),
            children: item.skewer.children.map((item: any) => convertIcon(config, item))
          }
          if(item.out) {
            returnValue.out = {
              id: nanoid(),
              alias: item.out.alias,
              type: item.out.alias,
              block: getBlockData(item.out, config),
              level: item.out.breakValue ?? item.out.continueValue ?? item.out.returnValue ?? item.out.returnIndex,
            };
          }
          return returnValue;
        }),
        gaps: obj.switches.gaps,
      };
      return dto;
    };
    case 'while': {
      const dto: WhileDto = {
        id: nanoid(),
        alias,
        block: getBlockData(obj, config),
        children: obj.skewer.children.map((item: any) => convertIcon(config, item)),
        trueIsMain: obj.trueIsMain,
      }
      return dto;
    };
    default: 
      throw new Error(`Icon not found: ${alias}`);
  }
};

const getBlockData = (obj: any, config: ProjectConfigDto2): BlockDto => {
  const block: any = {
    width: obj.blockWidth ?? 160,
  }
  if(config.type === 'text') {
    block.text = obj.text ?? '';
  } else {
    block.code = obj.code ?? '';
  }
  return block;
}

const getEmptyBlock = (config: ProjectConfigDto2): any => {
  if(config.type === 'text') {
    return { width: 160, text: '' };
  }
  return { width: 160, code: '' };
}
