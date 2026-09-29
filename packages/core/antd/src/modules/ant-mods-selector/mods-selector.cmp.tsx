import { observer } from 'mobx-react-lite';
import type { IDefaultMode, IIconComponent } from '@falang/scheme';
import { TOKEN_SCHEME, useService } from '@falang/scheme';
import styled from '@emotion/styled';
import Radio from 'antd/es/radio';
import { EyeOutlined, ForkOutlined } from '@ant-design/icons';

const ModsDiv = styled.div`
  position: absolute;
  left: 10px;
  bottom: 10px;
`;

const getIconByDefaultMode = (mode: IDefaultMode): IIconComponent => {
  switch (mode) {
    case 'start': {
      return EyeOutlined;
    }
    case 'transfer': {
      return ForkOutlined;
    }
    default: {
      return () => null;
    }
  }
};

export const ModsSelectorComponent: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  if (!scheme.isEditing) return null;
  const modes = scheme.mode.modes.filter((mode) => Boolean(mode.icon));
  const currentMode = scheme.mode.value;
  if (modes.length <= 1) return null;
  return (
    <ModsDiv>
      <Radio.Group
        value={currentMode}
        onChange={(e) => {
          if (!e.target.value) return;
          scheme.mode.setMode(e.target.value);
        }}
      >
        {modes.map((mode) => {
          let Icon = mode.icon;
          if (!Icon) return null;
          if (typeof Icon === 'string') {
            Icon = getIconByDefaultMode(Icon);
          }
          return (
            <Radio.Button key={mode.name} value={mode.name}>
              <Icon width={14} height={14} />
            </Radio.Button>
          );
        })}
      </Radio.Group>
    </ModsDiv>
  );
});
