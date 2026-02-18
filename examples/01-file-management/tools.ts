import * as fs from "node:fs/promises";

export const files = {
  async list(path: string) {
    const entries = await fs.readdir(path);
    return { files: entries };
  },

  async read(path: string) {
    const content = await fs.readFile(path, "utf-8");
    return { content };
  },

  async backup(path: string) {
    const dest = `${path}.bak`;
    await fs.copyFile(path, dest);
    return { backedUp: dest };
  },

  async remove(path: string) {
    await fs.unlink(path);
    return { deleted: path };
  },

  async forceRemove(path: string) {
    await fs.rm(path, { force: true });
    return { removed: path };
  },
};
