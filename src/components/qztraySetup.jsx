import React, { useEffect } from "react";
import qz from "qz-tray";

const AddTrustedSite = () => {
  useEffect(() => {
    // Connect to QZ Tray first
    qz.websocket.connect()
      .then(() => {
        // Add your site URL to trusted sites
        return qz.security.addCertificate(window.location.origin);
      })
      .then(() => {
        console.log("Site added to QZ Tray trusted sites:", window.location.origin);
      })
      .catch((err) => {
        console.error("Failed to add trusted site:", err);
      });
  }, []);

  return null; // This component just runs the effect
};

export default AddTrustedSite;