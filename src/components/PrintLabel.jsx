import React, { useState, useRef, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import LabelPDFDocument from "./LabelPDFDocument";
import JsBarcode from "jsbarcode";

const PrintLabelButton = ({ bin, onPrintComplete }) => {
  const iframeRef = useRef(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState(null);
  const [readyToPrint, setReadyToPrint] = useState(false);

  const generateBarcode = () => {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, bin.jtc || "", { format: "CODE128", displayValue: false });
    return canvas.toDataURL("image/png");
  };
const generatePdf = async () => {
  try {
    const barcodeUrl = generateBarcode();
    console.log("Barcode URL generated:", barcodeUrl);
    setBarcodeDataUrl(barcodeUrl);

    const doc = <LabelPDFDocument bin={bin} barcodeDataUrl={barcodeUrl} />;
    const asPdf = pdf();
    asPdf.updateContainer(doc);
    const blob = await asPdf.toBlob();

    if (!blob || blob.size === 0) {
      throw new Error("Generated PDF blob is empty");
    }
    console.log("PDF blob size:", blob.size);

    const url = URL.createObjectURL(blob);
    console.log("PDF URL created:", url);

    setPdfUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return url;
    });

    setReadyToPrint(false);
  } catch (error) {
    console.error("Error generating PDF:", error);
    setPdfUrl(null);
  }
};

  useEffect(() => {
    generatePdf();
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [bin]);

  useEffect(() => {
    if (pdfUrl) {
      setReadyToPrint(true);
    }
  }, [pdfUrl]);

  const onIframeLoad = () => {
    if (readyToPrint && iframeRef.current) {
      console.log("Iframe loaded, starting print...");
      const iframeWindow = iframeRef.current.contentWindow;
      iframeWindow.focus();

      // Reset readyToPrint BEFORE printing to avoid loops
      setReadyToPrint(false);

      setTimeout(() => {
        iframeWindow.print();    
        if (onPrintComplete) onPrintComplete();
      }, 500); // 500ms delay to ensure iframe content is ready
    }
  };

  return (
    <iframe
      ref={iframeRef}
      src={pdfUrl}
      style={{
        width: "600px",  // increased size for proper rendering
        height: "800px",
        border: "1px solid #ccc",
      }}
      title="Label Preview"
      onLoad={onIframeLoad}
    />
  );
};

export default PrintLabelButton;