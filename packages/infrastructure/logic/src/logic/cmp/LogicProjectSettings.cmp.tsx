import { LogicProjectStore } from "../LogicProject.store";
import { Card, FormGroup, InputGroup, MenuItem, Button } from '@blueprintjs/core';
import { Select } from '@blueprintjs/select';
import { ILogicOption } from "../LogicExportConfiguration";
import { observer } from "mobx-react";

export const LogicProjectSettingsComponent: React.FC<{ project: LogicProjectStore }> = observer(({ project }) => {
  const t = project.frontRoot.lang.t;
  return <>
    <h3>{t('logic:export_settings')}</h3>
    {project.exportConfiguration.items.map((item, index) => {
      return <Card compact key={index}>
        <FormGroup inline label={t('logic:language')}>
          <Select<ILogicOption>
            itemRenderer={({ text, value }, { handleClick, handleFocus }) => <MenuItem
              text={text}
              key={value}
              onClick={handleClick}
              onFocus={handleFocus}
            />}
            items={project.exportConfiguration.getLogicOptions()}
            onItemSelect={(selectedItem) => item.setLanguage(selectedItem.value)}
          >
            <Button text={item.language} rightIcon="double-caret-vertical" />
          </Select>
        </FormGroup>
        <FormGroup
          inline 
          label={t('logic:path')}
          helperText={`${t('logic:relative_path_to')}: ${project.rootPath}`}
        >
          <InputGroup 
            value={item.path}
            onChange={(e) => item.setPath(e.target.value)}
          />
        </FormGroup>
        <Button intent="danger" onClick={(() => {
          if (!confirm(t('base:sure'))) return;
          project.exportConfiguration.deleteItem(index);
        })}>{t('base:delete')}</Button>
      </Card>
    })}
    <Button onClick={() => project.exportConfiguration.addNewItem()}>{t('base:add')}</Button>
  </>;
});
