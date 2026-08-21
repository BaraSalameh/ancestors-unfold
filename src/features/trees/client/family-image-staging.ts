export function createFamilyImageStaging() {
  let files = new Map<string, File>();
  let urls = new Map<string, string>();

  const replace = (next: ReadonlyMap<string, File>) => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    files = new Map(next);
    urls = new Map([...files].map(([memberId, file]) => [memberId, URL.createObjectURL(file)]));
  };

  return {
    get files() {
      return files;
    },
    set files(next: Map<string, File>) {
      files = next;
    },
    replace,
    uploaded(memberId: string) {
      const url = urls.get(memberId);
      if (url) URL.revokeObjectURL(url);
      files.delete(memberId);
      urls.delete(memberId);
    },
    file: (memberId: string) => files.get(memberId),
    url: (memberId: string) => urls.get(memberId),
  };
}
