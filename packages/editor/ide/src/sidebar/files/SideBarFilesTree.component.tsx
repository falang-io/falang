import React from 'react';
import { Tree, TreeNodeInfo } from '@blueprintjs/core';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { observer } from 'mobx-react';
import { ProjectNameLayout, SideBarLayout } from '../styled.component';
import { IdeDirectoryStore, IdeFileStore } from '../../store/IdeDirectories.store';
import { IdeStore } from '../../Ide.store';
import { SchemeStore } from '@falang/editor-scheme';

export interface ISideBarFileTreeProps {
  ide: IdeStore
}

type TreeNodeList = TreeNodeInfo<IdeDirectoryStore | IdeFileStore>[];

const getDirStyle = (isDraggingOver: boolean): React.CSSProperties => {
  return isDraggingOver ? { background: '#ddd' } : {};
}

export const SideBarFilesTreeComponent: React.FC<ISideBarFileTreeProps> = observer(({ide}) => {
  return <SideBarLayout
    onContextMenu={(e) => {
      ide.sideBar.instruments.showContextMenuForTree(ide.rootDirectory, e.clientX, e.clientY);
      e.stopPropagation();
    }}
    style={{ width: ide.sideBar.width }}
  >
    <ProjectNameLayout>{ide.name}</ProjectNameLayout>
    <DragDropContext onDragEnd={(result) => {
      const filePath = result.source.droppableId;
      const directoryPath = result.destination?.droppableId;
      if (!directoryPath) return;
      ide.filesService.moveFile(filePath, directoryPath);
    }}>
      <Tree
        contents={getNodes(ide.rootDirectory, ide)}
        onNodeExpand={({ nodeData }) => {
          if (nodeData instanceof IdeDirectoryStore) {
            ide.sideBar.openDirectory(nodeData);
          }
        }}
        onNodeCollapse={({ nodeData }) => {
          if (nodeData instanceof IdeDirectoryStore) {
            ide.sideBar.closeDirectory(nodeData);
          }
        }}
        onNodeClick={({ nodeData }) => {
          if (nodeData instanceof IdeFileStore) {
            ide.sideBar.fileClicked(nodeData);
          }
        }}
        onNodeDoubleClick={({ nodeData }) => {
          if (nodeData instanceof IdeFileStore) {
            ide.sideBar.fileDoubleClicked(nodeData);
          }
        }}
        onNodeContextMenu={(node, path, e) => {
          ide.sideBar.instruments.showContextMenuForTree(node.nodeData ?? ide.rootDirectory, e.clientX, e.clientY);
          e.stopPropagation();
        }}
      />
    </DragDropContext>
  </SideBarLayout>
});


const getNodes = (directory: IdeDirectoryStore, ide: IdeStore): TreeNodeList => {
  const returnValue: TreeNodeList = [];
  directory.directories.forEach((childDirectory) => {
    const childName = childDirectory.name;
    returnValue.push({
      id: childDirectory.path,
      //label: childDirectory.name,
      label: <Droppable droppableId={childDirectory.path}>
        {(provided, snapshot) =>
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            style={getDirStyle(snapshot.isDraggingOver)}
          >
            {childName}
            <div style={{ display: 'none' }}>
              {provided.placeholder}
            </div>
          </div>
        }
      </Droppable>,
      icon: childDirectory.opened ? 'folder-open' : 'folder-close',
      hasCaret: true,
      isExpanded: childDirectory.opened,
      nodeData: childDirectory,
      childNodes: getNodes(childDirectory, ide),
    })
  });
  

  directory.files.forEach((file, index) => {
    const fileName = file.name;
    //console.log(file);
    const Icon: React.FC<{size: number, style?: React.CSSProperties}> | null = ide.projectType?.config.documentsConfig.find(c => c.name === file.type)?.icon ?? null;
    returnValue.push({
      id: file.path,
      label: <Droppable
        droppableId={file.path}
      >
        {(provided, snapshot) =>
          <span
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            <Draggable
              key={file.path}
              draggableId={file.path}
              index={index}
            >
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                >
                  {fileName}
                </div>
              )}
            </Draggable>
            <div style={{ display: 'none' }}>
              {provided.placeholder}
            </div>
          </span>
        }
      </Droppable>,
      icon: Icon ? <Icon style={{marginRight: '5px'}} size={18} /> : 'document',
      hasCaret: false,
      nodeData: file,
      isSelected: ide.selectedFilePath === file.path,
    })
  });
  return returnValue;
}