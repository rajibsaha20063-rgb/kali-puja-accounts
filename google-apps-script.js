/**
 * =========================================================================
 * NEIGHBOURHOOD CLUB 🔥 KALI PUJA 2026
 * 2-WAY AUTOMATIC GOOGLE APPS SCRIPT WEBHOOK
 * =========================================================================
 * How to Install:
 * 1. Open your Google Spreadsheet (https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE/edit)
 * 2. Click Extensions ➔ Apps Script.
 * 3. Delete any text in Code.gs, paste this entire file, and click Save (💾).
 * 4. Click Deploy ➔ New deployment.
 * 5. Select type: "Web app".
 * 6. Set Description: "Kali Puja Accounts 2-Way Sync".
 * 7. Set "Who has access" to: "Anyone" (crucial for webhook to connect).
 * 8. Click Deploy, Authorize access, and copy the Web App URL.
 * 9. Paste that URL into the Admin Panel / Push to Sheet modal on your website!
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', message: 'No POST data received' });
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // -------------------------------------------------------------
    // ACTION 1: ADD SINGLE ENTRY FROM WEBSITE
    // -------------------------------------------------------------
    if (data.action === 'add_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return jsonResponse({ status: 'error', message: 'Sheet not found: ' + sheetName });

      var lastRow = sheet.getLastRow();
      var slNo = Math.max(1, lastRow - 3);

      if (data.paraId >= 1 && data.paraId <= 5) {
        sheet.appendRow([
          slNo,
          data.familyHeadName || data.donorName || '',
          Number(data.targetAmount) || 0,
          Number(data.collectedAmount) || Number(data.amount) || 0,
          Number(data.dueBalance) || 0,
          data.paymentMode || 'Cash',
          data.dateOfPayment || data.date || '',
          data.collectedBy || ''
        ]);
      } else if (data.paraId === 6) {
        sheet.appendRow([
          slNo,
          data.shopName || data.donorName || '',
          data.marketLocation || '',
          Number(data.agreedTarget) || Number(data.targetAmount) || 0,
          Number(data.amountPaid) || Number(data.amount) || 0,
          Number(data.dueBalance) || 0,
          data.paymentMode || 'Cash',
          data.date || ''
        ]);
      } else if (data.paraId === 7) {
        sheet.appendRow([
          slNo,
          data.date || '',
          data.eventSpotType || data.donorName || '',
          Number(data.totalCollection) || Number(data.amount) || 0,
          data.leadVolunteer || '',
          data.handedOverTo || ''
        ]);
      }
      return jsonResponse({ status: 'success', message: 'Added entry to ' + sheetName });
    }

    // -------------------------------------------------------------
    // ACTION 2: DELETE AN ENTRY FROM GOOGLE SHEET
    // -------------------------------------------------------------
    if (data.action === 'delete_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet && data.name) {
        var values = sheet.getDataRange().getValues();
        var targetName = String(data.name).trim().toLowerCase();
        for (var r = values.length - 1; r >= 3; r--) {
          var rowName1 = String(values[r][1] || '').trim().toLowerCase();
          var rowName2 = String(values[r][2] || '').trim().toLowerCase();
          if (rowName1 === targetName || rowName2 === targetName) {
            sheet.deleteRow(r + 1);
            break;
          }
        }
      }
      return jsonResponse({ status: 'success', message: 'Deleted entry matching ' + data.name });
    }

    // -------------------------------------------------------------
    // ACTION 3: BATCH PUSH ALL WEBSITE DATA TO SPREADSHEET
    // -------------------------------------------------------------
    if (data.action === 'batch_sync') {
      var contributors = data.contributors || [];
      var expenses = data.expenses || [];

      // Update Expenses
      var expSheet = ss.getSheetByName('Expense Tracker');
      if (expSheet && expenses.length > 0) {
        expenses.forEach(function(item) {
          if (item.id >= 1 && item.id <= 12) {
            var rowNum = item.id + 2;
            if (item.vendorName !== undefined) expSheet.getRange(rowNum, 3).setValue(item.vendorName);
            if (item.budget !== undefined) expSheet.getRange(rowNum, 4).setValue(item.budget);
            if (item.advance !== undefined) expSheet.getRange(rowNum, 5).setValue(item.advance);
            if (item.totalPaid !== undefined) expSheet.getRange(rowNum, 6).setValue(item.totalPaid);
          }
        });
      }

      // Group contributors by section
      for (var p = 1; p <= 7; p++) {
        var sName = getSheetNameForParaId(p);
        var sSheet = ss.getSheetByName(sName);
        if (!sSheet) continue;

        var entries = contributors.filter(function(c) { return Number(c.paraId) === p; });
        if (entries.length > 0) {
          // Clear previous data rows (row 5 onwards)
          var currentLast = sSheet.getLastRow();
          if (currentLast >= 4) {
            // Check rows 4 to 53
            for (var i = 0; i < entries.length; i++) {
              var entry = entries[i];
              var rowNum = 4 + i;
              if (p >= 1 && p <= 5) {
                sSheet.getRange(rowNum, 1, 1, 8).setValues([[
                  i + 1,
                  entry.familyHeadName || entry.donorName || '',
                  Number(entry.targetAmount) || 0,
                  Number(entry.collectedAmount) || Number(entry.amount) || 0,
                  Number(entry.dueBalance) || 0,
                  entry.paymentMode || 'Cash',
                  entry.dateOfPayment || entry.date || '',
                  entry.collectedBy || ''
                ]]);
              } else if (p === 6) {
                sSheet.getRange(rowNum, 1, 1, 8).setValues([[
                  i + 1,
                  entry.shopName || entry.donorName || '',
                  entry.marketLocation || '',
                  Number(entry.agreedTarget) || Number(entry.targetAmount) || 0,
                  Number(entry.amountPaid) || Number(entry.amount) || 0,
                  Number(entry.dueBalance) || 0,
                  entry.paymentMode || 'Cash',
                  entry.date || ''
                ]]);
              } else if (p === 7) {
                sSheet.getRange(rowNum, 1, 1, 6).setValues([[
                  i + 1,
                  entry.date || '',
                  entry.eventSpotType || entry.donorName || '',
                  Number(entry.totalCollection) || Number(entry.amount) || 0,
                  entry.leadVolunteer || '',
                  entry.handedOverTo || ''
                ]]);
              }
            }
          }
        }
      }

      return jsonResponse({
        status: 'success',
        message: 'Successfully batch-synced ' + contributors.length + ' entries and ' + expenses.length + ' expenses.'
      });
    }

    // -------------------------------------------------------------
    // ACTION 4: UPDATE EXPENSE
    // -------------------------------------------------------------
    if (data.action === 'update_expense') {
      var sheet = ss.getSheetByName('Expense Tracker');
      if (sheet && data.id) {
        var rowNum = data.id + 2;
        if (data.vendorName !== undefined) sheet.getRange(rowNum, 3).setValue(data.vendorName);
        if (data.budget !== undefined) sheet.getRange(rowNum, 4).setValue(data.budget);
        if (data.advance !== undefined) sheet.getRange(rowNum, 5).setValue(data.advance);
        if (data.totalPaid !== undefined) sheet.getRange(rowNum, 6).setValue(data.totalPaid);
      }
      return jsonResponse({ status: 'success', message: 'Expense updated' });
    }

    return jsonResponse({ status: 'ignored', message: 'Unknown action' });
  } catch(err) {
    return jsonResponse({ status: 'error', error: err.toString() });
  }
}

function doGet(e) {
  return jsonResponse({
    status: 'online',
    message: 'Kali Puja 2-Way Sync Webhook is Active & Ready!',
    timestamp: new Date().toISOString()
  });
}

function getSheetNameForParaId(id) {
  var p = Number(id);
  if (p >= 1 && p <= 5) return 'Para ' + p;
  if (p === 6) return 'Shop Collection';
  if (p === 7) return 'Road Collection';
  return 'Dashboard & Summary';
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
