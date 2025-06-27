import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import LabelPDFDocument from "./LabelPDFDocument";

const MultiLabelPDFDocument = ({ bins, barcodeDataUrls }) => (
  <Document>
    {bins.map((bin, idx) => (
      <Page key={idx} size={{ width: 226.77, height: 198.43 }} style={{ padding: 10 }}>
        <LabelPDFDocument bin={bin} barcodeDataUrl={barcodeDataUrls[idx]} />
      </Page>
    ))}
  </Document>
);

export default MultiLabelPDFDocument;