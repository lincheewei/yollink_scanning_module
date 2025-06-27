import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 2,
    fontSize: 12,
    fontFamily: "Helvetica",
    flexDirection: "column",
    justifyContent: "center",
  },
  header: {
    fontSize: 14,
    textAlign: "center",
    fontWeight: "bold",
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
  },
  col30: {
    width: "30%",
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  col40: {
    width: "40%",
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  col70: {
    width: "70%",
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  col100: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  label: {
    marginTop: -6,
    marginLeft: -4,
    fontWeight: "bold",
    fontSize: 6,
    textAlign: "left",
    textDecoration: "underline",
    marginBottom: 2,
  },
  value: {
    textAlign: "left",
    minHeight: 10,
    flex: 1,
    fontSize: 10,
    paddingVertical: 4,
  },
  remarksContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  barcodeImage: {
    width: 80,
    height: 30,
    marginLeft: 8,
  },
});

const LabelPDFDocument = ({ bin, barcodeDataUrl }) => {
  const displayValue = (val) => {
    if (val === null || val === undefined) return "\u00A0";
    if (typeof val === "string" && val.trim() === "") return "\u00A0";
    return val.toString();
  };

  return (
    <Page size={{ width: 226.77, height: 198.43 }} style={styles.page}>
      {/* ROW 1: Header */}
      <Text style={styles.header}>WORK ORDER LABEL</Text>

      {/* ROW 2: 30% - 70% */}
      <View style={styles.row}>
        <View style={styles.col30}>
          <Text style={styles.label}>W.O. NO. :</Text>
          <Text style={styles.value}>{displayValue(bin.jtc)}</Text>
        </View>
        <View style={styles.col70}>
          <Text style={styles.label}>PART NAME :</Text>
          <Text style={styles.value}>{displayValue(bin.component_1)}</Text>
        </View>
      </View>

      {/* ROW 3: 30% - 30% - 40% */}
      <View style={styles.row}>
        <View style={styles.col30}>
          <Text style={styles.label}>DATE ISSUE :</Text>
          <Text style={styles.value}>
            {displayValue(bin.last_updated ? new Date(bin.last_updated).toLocaleDateString() : "")}
          </Text>
        </View>
        <View style={styles.col30}>
          <Text style={styles.label}>STOCK CODE :</Text>
          <Text style={styles.value}>{displayValue(bin.stock_code)}</Text>
        </View>
        <View style={styles.col40}>
          <Text style={styles.label}>PROCESS CODE / NO. :</Text>
          <Text style={styles.value}>{displayValue(bin.process_code)}</Text>
        </View>
      </View>

      {/* ROW 4: 30% - 70% */}
      <View style={styles.row}>
        <View style={styles.col30}>
          <Text style={styles.label}>EMP. NO. :</Text>
          <Text style={styles.value}>{displayValue(bin.emp_no)}</Text>
        </View>
        <View style={styles.col70}>
          <Text style={styles.label}>QTY :</Text>
          <Text style={styles.value}>{displayValue(bin.quantity_c1)}</Text>
        </View>
      </View>

      {/* ROW 5: 100% with barcode on top right */}
      <View style={styles.row}>
        <View style={styles.col100}>
          <Text style={styles.label}>REMARKS :</Text>
          <View style={styles.remarksContainer}>
            <Text style={styles.value}>{displayValue(bin.remarks)}</Text>
            {/* {barcodeDataUrl ? (
              <Image style={styles.barcodeImage} src={barcodeDataUrl} />
            ) : (
              <Text style={{ fontSize: 8, color: "red" }}>Barcode not available</Text>
            )} */}
          </View>
        </View>
      </View>
    </Page>
  );
};

export default LabelPDFDocument;