// IndexedDB Worker for ECG Monitor Recording
// Handles all database operations in a separate thread for better performance

let canvasCount = 1;
let selectedChannels = [0];

self.onmessage = async (event) => {
  const { action, data, filename, selectedChannels: channels } = event.data;

  // Open IndexedDB
  const db = await openIndexedDB();

  const handlePostMessage = (message) => {
    self.postMessage(message);
  };

  const handleError = (error) => {
    handlePostMessage({ error });
  };

  switch (action) {
    case 'setCanvasCount':
      canvasCount = event.data.canvasCount;
      handlePostMessage({ success: true, message: 'Canvas count updated' });
      break;

    case 'setSelectedChannels':
      if (Array.isArray(channels) && channels.every((ch) => typeof ch === 'number')) {
        selectedChannels = channels;
        handlePostMessage({ success: true, message: 'Selected channels updated' });
      } else {
        console.error('Invalid selectedChannels received:', channels);
        handlePostMessage({ success: false, message: 'Invalid selectedChannels format' });
      }
      break;

    case 'write':
      try {
        const success = await writeToIndexedDB(db, data, filename);
        handlePostMessage({ success });
      } catch (error) {
        handleError('Failed to write data to IndexedDB');
      }
      break;

    case 'getFileCountFromIndexedDB':
      try {
        const allData = await getFileCountFromIndexedDB(db);
        handlePostMessage({ allData });
      } catch (error) {
        handleError('Failed to retrieve data from IndexedDB');
      }
      break;

    case 'saveDataByFilename':
      try {
        const blob = await saveDataByFilename(filename, canvasCount, selectedChannels);
        handlePostMessage({ blob });
      } catch (error) {
        handleError(error instanceof Error ? error.message : 'Unknown error');
      }
      break;

    case 'deleteFile':
      if (!filename) {
        throw new Error('Filename is required for deleteFile action.');
      }
      await deleteFilesByFilename(filename);
      handlePostMessage({ success: true, action: 'deleteFile' });
      break;

    case 'deleteAll':
      await deleteAllDataFromIndexedDB();
      handlePostMessage({ success: true, action: 'deleteAll' });
      break;

    default:
      handlePostMessage({ error: 'Invalid action' });
  }
};

// Function to open IndexedDB
const openIndexedDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ECGRecordings", 2);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("ECGRecordings")) {
        const store = db.createObjectStore("ECGRecordings", { keyPath: "filename" });
        store.createIndex("filename", "filename", { unique: true });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// Helper function for IndexedDB transactions
const performIndexDBTransaction = async (db, storeName, mode, callback) => {
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);

  try {
    return await callback(store);
  } catch (error) {
    throw new Error(`Transaction failed: ${error}`);
  }
};

// Function to write data to IndexedDB
const writeToIndexedDB = async (db, data, filename) => {
  try {
    const existingRecord = await performIndexDBTransaction(db, "ECGRecordings", "readwrite", (store) => {
      return new Promise((resolve, reject) => {
        const getRequest = store.get(filename);
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(new Error("Error retrieving record"));
      });
    });

    if (existingRecord) {
      existingRecord.content.push(...data);
      await performIndexDBTransaction(db, "ECGRecordings", "readwrite", (store) => {
        return new Promise((resolve, reject) => {
          const putRequest = store.put(existingRecord);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error("Error updating record"));
        });
      });
    } else {
      const newRecord = { filename, content: [...data] };
      await performIndexDBTransaction(db, "ECGRecordings", "readwrite", (store) => {
        return new Promise((resolve, reject) => {
          const putRequest = store.put(newRecord);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error("Error inserting record"));
        });
      });
    }

    return true;
  } catch (error) {
    console.error("Error writing to IndexedDB:", error);
    return false;
  }
};

// Function to get all data from IndexedDB
const getAllDataFromIndexedDB = async (db) => {
  try {
    return await performIndexDBTransaction(db, "ECGRecordings", "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (error) => reject(new Error(`Error retrieving data: ${error}`));
      });
    });
  } catch (error) {
    console.error("Error getting all data from IndexedDB:", error);
    throw error;
  }
};

// Convert data to CSV format
const convertToCSV = (data, canvasCount, selectedChannels) => {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid or empty data provided for CSV conversion.");
  }

  // Create header row
  const header = ["Sample Counter", ...selectedChannels.map((ch) => `CH${ch}`)];

  // Create data rows
  const rows = data.map((item, index) => {
    if (!Array.isArray(item)) {
      console.warn(`Item at index ${index} is not an array:`, item);
      return [];
    }

    const filteredRow = [
      item[0], // Sample counter
      ...selectedChannels.map((channel, i) => {
        if (channel !== undefined && item[i + 1] !== undefined) {
          return item[i + 1];
        } else {
          console.warn(`Missing data for channel ${channel} in item ${index}:`, item);
          return "";
        }
      }),
    ];

    return filteredRow
      .map((field) => (field !== undefined && field !== null ? JSON.stringify(field) : ""))
      .join(",");
  });

  // Combine header and rows into a CSV format
  const csvContent = [header.join(","), ...rows].join("\n");
  return csvContent;
};

// Function to save data by filename
const saveDataByFilename = async (filename, canvasCount, selectedChannels) => {
  try {
    const db = await openIndexedDB();

    const record = await performIndexDBTransaction(db, "ECGRecordings", "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const index = store.index("filename");
        const getRequest = index.get(filename);
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(new Error("Error retrieving record"));
      });
    });

    if (!record || !Array.isArray(record.content)) {
      throw new Error("No data found for the given filename or invalid data format.");
    }

    if (!record.content.every((item) => Array.isArray(item))) {
      throw new Error("Content data contains invalid or non-array elements.");
    }

    try {
      const csvData = convertToCSV(record.content, canvasCount, selectedChannels);
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
      return blob;
    } catch (conversionError) {
      console.error("Error converting data to CSV:", conversionError);
      throw new Error("Failed to convert data to CSV format.");
    }
  } catch (error) {
    console.error("Error during file download:", error);
    throw new Error("Error occurred during file download.");
  }
};

// Function to get file count from IndexedDB
const getFileCountFromIndexedDB = async (db) => {
  return performIndexDBTransaction(db, "ECGRecordings", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const filenames = [];
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          filenames.push(cursor.value.filename);
          cursor.continue();
        } else {
          resolve(filenames);
        }
      };

      cursorRequest.onerror = (event) => {
        const error = event.target.error;
        console.error("Error retrieving filenames from IndexedDB:", error);
        reject(error);
      };
    });
  });
};

// Function to delete files by filename
const deleteFilesByFilename = async (filename) => {
  const dbRequest = indexedDB.open("ECGRecordings");

  return new Promise((resolve, reject) => {
    dbRequest.onsuccess = async (event) => {
      const db = event.target.result;

      try {
        await performIndexDBTransaction(db, "ECGRecordings", "readwrite", async (store) => {
          if (!store.indexNames.contains("filename")) {
            throw new Error("Index 'filename' does not exist.");
          }

          const index = store.index("filename");
          const cursorRequest = index.openCursor(IDBKeyRange.only(filename));

          return new Promise((resolveCursor, rejectCursor) => {
            cursorRequest.onsuccess = (cursorEvent) => {
              const cursor = cursorEvent.target.result;
              if (cursor) {
                cursor.delete();
                resolveCursor();
              } else {
                rejectCursor(new Error("File not found."));
              }
            };

            cursorRequest.onerror = (event) => {
              rejectCursor(event.target.error);
            };
          });
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    };

    dbRequest.onerror = () => reject(new Error("Failed to open IndexedDB."));
    dbRequest.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("ECGRecordings")) {
        const store = db.createObjectStore("ECGRecordings", { keyPath: "filename" });
        store.createIndex("filename", "filename", { unique: false });
      }
    };
  });
};

// Function to delete all data from IndexedDB
const deleteAllDataFromIndexedDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ECGRecordings");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Failed to delete database"));
  });
};
