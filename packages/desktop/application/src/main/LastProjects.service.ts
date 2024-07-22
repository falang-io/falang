import { getCustomConfigFilePath } from './Fs.service';
import { promises as fs, existsSync } from 'fs';

interface OpenedItem {
  path: string
  name: string
}

export class LastProjectsService {

  private configPath = '';
  private _data: OpenedItem[] = [];
  private onUpdate: () => void;

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate;
  }

  async init() {
    this.configPath = await getCustomConfigFilePath('lastOpenedProjects');
    const fileExists = existsSync(this.configPath);
    if (!fileExists) return;
    const contents = await fs.readFile(this.configPath);
    const data = JSON.parse(contents.toString()) as OpenedItem[];
    this._data = data;
  }

  get data() {
    return this._data;
  }

  async onOpen(path: string) {
    try {
      const fileExists = existsSync(path);
      if (!fileExists) return;
      const contents = await fs.readFile(path);
      const name: string = JSON.parse(contents.toString()).name;
      if (!name) return;
      let filtered = this._data.filter(item => item.path !== path);
      filtered.unshift({
        name, path,
      });
      filtered = filtered.slice(0, 10);
      this._data = filtered;
      await this.save();
      this.onUpdate();
    } catch (err) {
      console.error(err);
    }
  }

  private async save() {
    await fs.writeFile(this.configPath, JSON.stringify(this._data));
  }
}
