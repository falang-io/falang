import { action, makeObservable, runInAction } from 'mobx';
import { SchemeStore } from './Scheme.store';

type TListener = (e: TouchEvent) => void;

export class MouseEventsService {
  private firstTouchId: number | null = null;
  private firstTouchLastX = 0;
  private firstTouchLastY = 0;
  private firstTouchCurrentX = 0;
  private firstTouchCurrentY = 0;

  private secondTouchId: number | null = null;
  private secondTouchLastX = 0;
  private secondTouchLastY = 0;
  private secondTouchCurrentX = 0;
  private secondTouchCurrentY = 0;

  private zoomCenterLastX = 0;
  private zoomCenterLastY = 0;
  private zoomCenterCurrentX = 0;
  private zoomCenterCurrentY = 0;

  private listenerTouchStart: TListener;
  private listenerTouchEnd: TListener;
  private listenerTouchMove: TListener;


  constructor(readonly scheme: SchemeStore) {
    makeObservable(this);
    this.listenerTouchStart = (e: TouchEvent) => {
      this.onTouchStart(e);
    };
    this.listenerTouchEnd = (e: TouchEvent) => {
      this.onTouchEnd(e);
    };
    this.listenerTouchMove = (e: TouchEvent) => {
      this.onTouchMove(e);
      return false;
    };
    if(document) {
      document.addEventListener('touchstart', this.listenerTouchStart)
      document.addEventListener('touchend', this.listenerTouchEnd)
      document.addEventListener('touchmove', this.listenerTouchMove)
    }
  }

  @action onMouseWheel(e: React.WheelEvent) {
    if(this.scheme.busy) return;
    const rect = this.scheme.getDomRect();
    this.scheme.viewPosition.zoom({
      x: e.clientX - rect.x,
      y: e.clientY - rect.y,
      wheeldy: e.deltaY,
    });
  }

  @action onMouseMove(e: React.MouseEvent) {
    if(this.scheme.busy) return;
    const rect = this.scheme.getDomRect();
    const { x, y, scale } = this.scheme.viewPosition;
    const relativeX = (e.clientX - rect.x - x) / scale;
    const relativeY = (e.clientY - rect.y - y) / scale;
    this.scheme.mousePosition.set({ x: relativeX, y: relativeY });
    if(e.buttons === 4) {
      this.scheme.viewPosition.move(e.movementX, e.movementY);
    } else if (e.buttons === 1) {
      if(this.scheme.state === 'resize-block') {
        this.scheme.iconResizer.onMouseMove(e);
      } else if((this.scheme.state === 'start' || this.scheme.state === 'selected') && !this.scheme.dnd.isDraggingPrepared) {
        this.scheme.state = 'moving';
        this.scheme.viewPosition.move(e.movementX, e.movementY);
      } else if(this.scheme.state === 'moving') {
        this.scheme.viewPosition.move(e.movementX, e.movementY);
      } else if(this.scheme.state === 'drag-icons' || this.scheme.dnd.isDraggingPrepared) {
        this.scheme.dnd.drag(relativeX, relativeY);  
      } else if(this.scheme.state === 'resize-gap') {
        this.scheme.gapModify.onMouseMove(relativeX);
      }
    }
  }

  @action onMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    this.scheme.dnd.stopDrag();
    if(this.scheme.busy) return;
  }

  @action onMouseUp(e: React.MouseEvent) {
    const isMoving = this.scheme.state === 'moving';
    if(this.scheme.state === 'resize-block') {
      this.scheme.iconResizer.onMouseUp(e);
    } else if(isMoving && this.scheme.editing.editingIcon) {
      this.scheme.state = 'edit-icon';
    } else if(this.scheme.state === 'drag-icons') {
      this.scheme.dnd.stopDrag();
    } else if(this.scheme.state === 'resize-gap') {
      this.scheme.gapModify.stop();
    } else if(!this.scheme.editing.editingIcon) {
      this.scheme.resetState();
    }    
  }

  @action onMouseLeave(e: React.MouseEvent) { 
    if(this.scheme.state === 'selected' || this.scheme.state === 'animation' || this.scheme.state === 'edit-icon') return;
    this.scheme.resetState();
  }

  @action onClick(e: React.MouseEvent) {
    if(this.scheme.state === 'resize-block') {
      return;
    }
    //console.log('onClick', (new Error).stack);
    this.scheme.resetState();
  }

  @action onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
  }

  private updateTouches(e: TouchEvent) {
    const firstTouch: React.Touch | null = this.getTouchByIdentifier(e, (this.firstTouchId === null) ? -1 : this.firstTouchId) || e.touches[0] || null;
    const secondTouch = this.getTouchByIdentifier(
      e,
      (this.secondTouchId === firstTouch?.identifier ? -1 : this.secondTouchId) ?? -1,
    ) || this.getTouchByIdentifierExcept(e, firstTouch.identifier);

    if(firstTouch) {
      this.firstTouchId = firstTouch.identifier;
      this.firstTouchCurrentX = firstTouch.clientX;
      this.firstTouchCurrentY = firstTouch.clientY;
    } else {
      this.firstTouchId = null;
    }
    if(firstTouch && secondTouch) {
      this.secondTouchId = secondTouch.identifier;
      this.secondTouchCurrentX = secondTouch.clientX;
      this.secondTouchCurrentY = secondTouch.clientY;
      this.zoomCenterCurrentX = Math.round((firstTouch.clientX + secondTouch.clientX) / 2);
      this.zoomCenterCurrentY = Math.round((firstTouch.clientY + secondTouch.clientY) / 2);
    } else {
      this.secondTouchId = null;
    }
  }

  private updateLastTouch() {
    this.firstTouchLastX = this.firstTouchCurrentX;
    this.firstTouchLastY = this.firstTouchCurrentY;
    this.secondTouchLastX = this.secondTouchCurrentX;
    this.secondTouchLastY = this.secondTouchCurrentY;
    this.zoomCenterLastX = this.zoomCenterCurrentX;
    this.zoomCenterLastY = this.zoomCenterCurrentY;
  }

  private getTouchByIdentifier(e: TouchEvent, id: number): React.Touch | null {
    for(let i = 0; i < e.touches.length; i++) {
      if(e.touches[i].identifier === id) return e.touches[i];
    }
    return null;
  }

  private getTouchByIdentifierExcept(e: TouchEvent, exceptId: number): React.Touch | null {
    for(let i = 0; i < e.touches.length; i++) {
      if(e.touches[i].identifier !== exceptId) return e.touches[i];
    }
    return null;
  }

  @action onTouchStart(e: TouchEvent) {
    this.updateTouches(e);
    this.updateLastTouch();
  }

  @action onTouchEnd(e: TouchEvent) {
    if(e.touches.length === 1 && e.touches[0].identifier === this.secondTouchId) {
      this.firstTouchLastX = this.secondTouchCurrentX;
      this.firstTouchLastY = this.secondTouchCurrentY;
    }
    this.firstTouchId = null;
    this.secondTouchId = null;
  }



  @action onTouchMove(e: TouchEvent) {
    this.updateTouches(e);
    if(this.firstTouchId !== null && this.secondTouchId !== null) {
      const currentDistance = Math.sqrt(Math.pow(this.firstTouchCurrentX - this.secondTouchCurrentX, 2) + Math.pow(this.firstTouchCurrentY - this.secondTouchCurrentY, 2));
      const lastDistance = Math.sqrt(Math.pow(this.firstTouchLastX - this.secondTouchLastX, 2) + Math.pow(this.firstTouchLastY - this.secondTouchLastY, 2));
      const middleX = Math.round((this.firstTouchCurrentX + this.secondTouchCurrentX) / 2);
      const middleY = Math.round((this.firstTouchCurrentY + this.secondTouchCurrentY) / 2)
      const scaleFactor = currentDistance / lastDistance;
      const dx = this.zoomCenterCurrentX - this.zoomCenterLastX;
      const dy = this.zoomCenterCurrentY - this.zoomCenterLastY;
      runInAction(() => {
        const rect = this.scheme.getDomRect();
        this.scheme.viewPosition.zoomScale(scaleFactor, middleX - rect.x, middleY - rect.y);
        this.scheme.viewPosition.move(dx, dy);
      });
    } else if (this.firstTouchId !== null) {
      this.scheme.viewPosition.move(this.firstTouchCurrentX - this.firstTouchLastX, this.firstTouchCurrentY - this.firstTouchLastY);
    }
    this.updateLastTouch();
    e.preventDefault();
    e.stopPropagation();
  }

  dispose() {
    if(document) {
      document.removeEventListener('touchstart', this.listenerTouchStart);
      document.removeEventListener('touchend', this.listenerTouchEnd);
      document.removeEventListener('touchmove', this.listenerTouchMove);
    }
  }
}

function touch2Mouse(e: TouchEvent)
{
  var theTouch = e.changedTouches[0];
  var mouseEv;

  switch(e.type)
  {
    case "touchstart": mouseEv="mousedown"; break;  
    case "touchend":   mouseEv="mouseup"; break;
    case "touchmove":  mouseEv="mousemove"; break;
    default: return;
  }

  var mouseEvent = document.createEvent("MouseEvent");
  mouseEvent.initMouseEvent(mouseEv, true, true, window, 1, theTouch.screenX, theTouch.screenY, theTouch.clientX, theTouch.clientY, false, false, false, false, 0, null);
  theTouch.target.dispatchEvent(mouseEvent);

  e.preventDefault();
}