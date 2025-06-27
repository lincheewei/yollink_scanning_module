import React, { useState, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import LabelPDFDocument from "./LabelPDFDocument"; // Your existing PDF doc component
import JsBarcode from "jsbarcode";

const PdfTest = () => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState(null);

  const dummyBin = {
    jtc: "TEST12345",
    component_1: "Test Widget",
    last_updated: new Date().toISOString(),
    stock_code: "STK-TEST",
    process_code: "PROC-TEST",
    emp_no: "EMP-999",
    quantity_c1: 42,
    remarks: "This is a test print label",
  };

  const generateBarcode = () => {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, dummyBin.jtc || "", { format: "CODE128", displayValue: false });
    return canvas.toDataURL("image/png");
  };

  useEffect(() => {
    const generatePdf = async () => {
      try {
        const barcodeUrl = generateBarcode();
        setBarcodeDataUrl(barcodeUrl);

        const doc = <LabelPDFDocument bin={dummyBin} barcodeDataUrl={barcodeUrl} />;
        const asPdf = pdf();
        asPdf.updateContainer(doc);
        const blob = await asPdf.toBlob();

        if (!blob || blob.size === 0) {
          throw new Error("Generated PDF blob is empty");
        }

        const url = URL.createObjectURL(blob);
        console.log("PDF URL:", url);
        setPdfUrl(url);
      } catch (error) {
        console.error("Error generating PDF:", error);
        setPdfUrl(null);
      }
    };

    generatePdf();

    // Cleanup URL on unmount
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, []);

  return (
    <div>
      <h2>PDF Generation Test</h2>
      {pdfUrl ? (
        <embed src={pdfUrl} type="application/pdf" width="600" height="800" />
      ) : (
        <p>Generating PDF...</p>
      )}
    </div>
  );
};

export default PdfTest;