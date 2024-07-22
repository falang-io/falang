import React from "react";
import { observer } from "mobx-react";
import { SchemeStore } from '../store/Scheme.store';
import { SchemeSvgComponent } from './SchemeSvg.cmp';
import { BlockErrorsComponent } from './BlockErrors.cmp';

interface EditorComponentProps {
  scheme: SchemeStore
}

const EditorBackgroundComponent: React.FC<EditorComponentProps> = ({ scheme }) => {
  return <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      background: 'transparent'
    }}
    onMouseDown={(e) => {
      e.stopPropagation();
      e.preventDefault();      
    }}
    onMouseUp={(e) => {
      e.stopPropagation();
      e.preventDefault();
    }}
    onMouseMove={(e) => {
      e.stopPropagation();
      e.preventDefault();
    }}
    onClick={(e) => {
      //if(scheme.state === 'moving') return;
      //console.log('click');
      e.stopPropagation();
      e.preventDefault();
      scheme.editing.stopEdit();
    }}
    
  ></div>
};

const BlockEditorComponent: React.FC<EditorComponentProps> = observer(({ scheme }) => {
  const editingIcon = scheme.editing.editingIcon;
  if(!scheme.editing.isIconEditing || !editingIcon) {
    return null;
  }
  const Editor = editingIcon.block.transformer.viewConfig.editor;
  return <>
    <EditorBackgroundComponent scheme={scheme} />
    <BlockErrorsComponent block={editingIcon.block} />
    <Editor block={editingIcon.block} />
  </>
});

export const SchemeComponent: React.FC<EditorComponentProps> = observer(({ scheme }) => {
  const mouseEvents = scheme.mouseEvents;  
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        background: scheme.editorBackgroundColor,
        cursor: (scheme.dnd.isDragging || scheme.state === 'moving') ? 'grabbing' : 'default'
      }}
      onWheel={(e) => mouseEvents.onMouseWheel(e)}
      onMouseMove={(e) => mouseEvents.onMouseMove(e)}
      onClick={(e) => {
        if(scheme.isEditing) {
          return;
        }
        mouseEvents.onClick(e);
      }}
      onMouseUp={(e) => mouseEvents.onMouseUp(e)}
      onMouseLeave={(e) => mouseEvents.onMouseLeave(e)}
      onMouseDown={(e) => mouseEvents.onMouseDown(e)}
      onContextMenu={(e) => mouseEvents.onContextMenu(e)}
    >
      <SchemeSvgComponent scheme={scheme} /> 
      <BlockEditorComponent scheme={scheme} />
      {/*<div style={{
        background: 'white',
        position: 'absolute',
        right: '2px',
        bottom: '2px',
        border: '1px solid black',
        padding: '2px'
      }}>
        {Math.round(scheme.mousePosition.x)} {Math.round(scheme.mousePosition.y)}
      </div>*/}
    </div>
  );
});