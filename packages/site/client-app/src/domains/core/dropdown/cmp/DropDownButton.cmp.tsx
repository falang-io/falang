/* eslint-disable jsx-a11y/anchor-is-valid */
import React from 'react';
import { TDropDownMenuData } from '../store/DropDownMenuState';

type TDropDownPosition = 'left' | 'right';

interface DropDownButtonComponentParams {
  menu: TDropDownMenuData;
  tabIndex: number;
  text: string;
  position?: TDropDownPosition;
  ulStyle?: React.CSSProperties;
  disabled?: boolean
}

export const DropDownButtonComponent: React.FC<DropDownButtonComponentParams> = ({ menu, tabIndex, text, ulStyle, position, disabled }) => {
  const [isVisible, setIsVisible] = React.useState<boolean>(true);
  React.useEffect(() => {
    if (!isVisible) {
      setTimeout(() => setIsVisible(true), 100);
    }
  }, [isVisible]);
  const className = `dropdown${position === 'right' ? ' dropdown-right' : ''}`;
  return <div className={className}>
    <button disabled={disabled} className="btn btn-link dropdown-toggle" tabIndex={tabIndex}>
      {text}<i className="icon icon-caret"></i>
    </button>
    {isVisible ? <ul className="menu" style={ulStyle}>
      {menu.map((item, index) => (
        <li className="menu-item" key={index}>
          <a href='#' tabIndex={0} onClick={(e) => {
            e.preventDefault();
            setTimeout(() => window.focus(), 10);
            item.onClick && item.onClick()
            setTimeout(() => setIsVisible(false), 50);
          }}><span>{item.text}</span></a>
        </li>
      ))}
    </ul> : null}
  </div>;
};
