import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { runInAction } from 'mobx';
import { NewProjectDialogStore } from './new-project-dialog-store.js';

const setUpFalang = (): { create: ReturnType<typeof vi.fn> } => {
  const create = vi
    .fn()
    .mockResolvedValue({ documents: [], folders: [], formatVersion: 4, name: 'x', type: 'arduino' });
  (globalThis as { falang?: unknown }).falang = {
    dialog: {
      newProjectFolder: vi.fn().mockResolvedValue(null),
    },
    project: {
      create,
      suggestNewLocation: vi.fn().mockResolvedValue({
        baseDir: '/home/user/Documents/Falang',
        dir: '/home/user/Documents/Falang/Project1',
        name: 'Project1',
      }),
    },
    recentProjects: {
      add: vi.fn().mockResolvedValue(null),
    },
  };
  return { create };
};

describe('NewProjectDialogStore', () => {
  it('open() fills in the suggested location from main and defaults the board', async () => {
    setUpFalang();
    const store = new NewProjectDialogStore();
    store.open();
    await vi.waitFor(() => expect(store.name).toBe('Project1'));
    expect(store.directory).toBe('/home/user/Documents/Falang/Project1');
    expect(store.isOpen).toBe(true);
    expect(store.board).toBe('arduino:avr:uno');
  });

  it('changing the name keeps the directory following it until the directory is hand-edited', async () => {
    setUpFalang();
    const store = new NewProjectDialogStore();
    store.open();
    await vi.waitFor(() => expect(store.name).toBe('Project1'));

    runInAction(() => store.setName('MyProject'));
    expect(store.directory).toBe('/home/user/Documents/Falang/MyProject');

    // Once the user edits the directory directly, further name changes stop following it.
    runInAction(() => store.setDirectory('/somewhere/else'));
    runInAction(() => store.setName('AnotherName'));
    expect(store.directory).toBe('/somewhere/else');
  });

  it('create() rejects an empty name without calling any IPC', async () => {
    const { create } = setUpFalang();
    const store = new NewProjectDialogStore();
    store.open();
    await vi.waitFor(() => expect(store.name).toBe('Project1'));
    runInAction(() => store.setName(''));

    await store.create();

    expect(store.error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);
  });

  it('create() rejects an empty directory without calling any IPC', async () => {
    const { create } = setUpFalang();
    const store = new NewProjectDialogStore();
    store.open();
    await vi.waitFor(() => expect(store.name).toBe('Project1'));
    runInAction(() => store.setDirectory(''));

    await store.create();

    expect(store.error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('create() with valid fields calls project.create with the chosen board and closes the dialog', async () => {
    const { create } = setUpFalang();
    const store = new NewProjectDialogStore();
    store.open();
    await vi.waitFor(() => expect(store.name).toBe('Project1'));
    runInAction(() => store.setBoard('arduino:avr:mega'));

    await store.create();

    expect(create).toHaveBeenCalledWith('/home/user/Documents/Falang/Project1', {
      name: 'Project1',
      type: 'arduino',
      board: 'arduino:avr:mega',
    });
    expect(store.isOpen).toBe(false);
    expect(store.error).toBeNull();
  });

  it('create() surfaces an IPC failure as store.error without closing the dialog', async () => {
    setUpFalang();
    (globalThis.falang.project.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('a project already exists there'),
    );
    const store = new NewProjectDialogStore();
    store.open();
    await vi.waitFor(() => expect(store.name).toBe('Project1'));

    await store.create();

    expect(store.error).toContain('already exists');
    expect(store.isOpen).toBe(true);
  });
});
