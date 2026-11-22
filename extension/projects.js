/* Shared by the service worker and studio. Projects never leave this browser. */
const atlasProjects = (() => {
  let database;
  function open() {
    database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('pageatlas-projects', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return database;
  }
  async function run(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', mode);
      const request = operation(transaction.objectStore('projects'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Project save interrupted'));
    });
  }
  return {
    list: () => run('readonly', store => store.getAll()),
    get: id => run('readonly', store => store.get(id)),
    save: project => run('readwrite', store => store.put({ ...project, updatedAt: Date.now() })),
    remove: id => run('readwrite', store => store.delete(id))
  };
})();
