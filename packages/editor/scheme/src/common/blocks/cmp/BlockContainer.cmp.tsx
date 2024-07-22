import { observer } from 'mobx-react';
import { IconResizerComponent } from '../icon-resizer/IconResizer.component';
import { IconComponent } from '../../../icons/base/Icon.cmp';
import { IconStore } from '../../../icons/base/Icon.store';
import { BlockComponent } from './Block.cmp';

export type TBlockContainerComponentProps =
  {
    icon: IconStore,
    hideResize?: boolean,
  } & React.PropsWithChildren;

export const BlockContainerComponent: React.FC<TBlockContainerComponentProps> = observer(({
  icon,
  children,
  hideResize,
}) => {
  const scheme = icon.scheme;
  const onlySelected = scheme.selection.onlySelectedIcon;
  const events = icon.scheme.iconMouseEvents;
  //if(icon.leftSideStore ) console.log('left side', icon.leftSideStore);
  const iconIndex = icon.scheme.enumeratorStore.getIconIndex(icon.id);
  return <>
    {icon.leftSideStore ? <IconComponent icon={icon.leftSideStore} /> : null}
    <g
      onClick={(e) => events.onClick(e, icon)}
      onMouseDown={(e) => events.onMouseDown(e, icon)}
      onDoubleClick={(e) => events.onDoubleClick(e, icon)}
      onMouseUp={(e) => events.onMouseUp(e, icon)}
      onContextMenu={(e) => events.onContextMenu(e, icon)}
      onMouseOver={(e) => events.onMouseOver(e, icon)}
      className={icon.blockClassName}
      style={icon.blockBodyStyles}
    >
      {children}      
      <BlockComponent block={icon.block} />
      {((scheme.state === 'resize-block' || scheme.state === 'selected') && onlySelected?.id === icon.id && !hideResize) ? <>
        <IconResizerComponent block={onlySelected.block} state={scheme.iconResizer} />
      </> : null}
      {iconIndex ? <text 
        className="inblock-text" 
        x={icon.position.x + 2}
        y={icon.position.y - 2}
        >{iconIndex}</text> : null}
      
    </g>

  </>;
});
