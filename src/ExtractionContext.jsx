import { createContext, useContext, useState, useEffect } from "react";

const ExtractionContext = createContext(null);

export function useExtraction() {
  return useContext(ExtractionContext);
}

export function ExtractionProvider({ children }) {
  // Extraction state — persists across tab navigation
  const [extractionState, setExtractionState] = useState(null);
  // Shape: { breeder, fileName, startPage, endPage, totalToProcess, processedPages,
  //          extractedItems, pageConfidences, batchErrors, extracting, cancelled,
  //          detectedStructure, currentBatch, step, pdfDoc }

  // beforeunload warning when extracting
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (extractionState?.extracting) {
        e.preventDefault();
        e.returnValue = "Catalog import is still in progress. Are you sure you want to leave?";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [extractionState?.extracting]);

  return (
    <ExtractionContext.Provider value={{ extractionState, setExtractionState }}>
      {children}
    </ExtractionContext.Provider>
  );
}
