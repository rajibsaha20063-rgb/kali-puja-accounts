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
    // ACTION 1: ADD SINGLE ENTRY FROM WEBSITE (STARTS AT ROW 5)
    // -------------------------------------------------------------
    if (data.action === 'add_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return jsonResponse({ status: 'error', message: 'Sheet not found: ' + sheetName });

      // Find first empty row starting strictly from Row 5 (Row 4 is reserved for phone/collector header)
      var targetRow = 5;
      var lastRow = sheet.getLastRow();
      if (lastRow >= 5) {
        var names = sheet.getRange(5, 2, Math.max(lastRow - 4, 1), 1).getValues();
        var foundEmpty = false;
        for (var r = 0; r < names.length; r++) {
          if (!names[r][0] || String(names[r][0]).trim() === '') {
            targetRow = 5 + r;
            foundEmpty = true;
            break;
          }
        }
        if (!foundEmpty) {
          targetRow = 5 + names.length;
        }
      }
      var slNo = Math.max(1, targetRow - 4);

      if (data.paraId >= 1 && data.paraId <= 5) {
        sheet.getRange(targetRow, 1, 1, 8).setValues([[
          slNo,
          data.familyHeadName || data.donorName || '',
          Number(data.targetAmount) || 0,
          Number(data.collectedAmount) || Number(data.amount) || 0,
          Number(data.dueBalance) || 0,
          data.paymentMode || 'Cash',
          data.dateOfPayment || data.date || '',
          data.collectedBy || ''
        ]]);
      } else if (data.paraId === 6) {
        sheet.getRange(targetRow, 1, 1, 8).setValues([[
          slNo,
          data.shopName || data.donorName || '',
          data.marketLocation || '',
          Number(data.agreedTarget) || Number(data.targetAmount) || 0,
          Number(data.amountPaid) || Number(data.amount) || 0,
          Number(data.dueBalance) || 0,
          data.paymentMode || 'Cash',
          data.date || ''
        ]]);
      } else if (data.paraId === 7) {
        sheet.getRange(targetRow, 1, 1, 6).setValues([[
          slNo,
          data.date || '',
          data.eventSpotType || data.donorName || '',
          Number(data.totalCollection) || Number(data.amount) || 0,
          data.leadVolunteer || '',
          data.handedOverTo || ''
        ]]);
      }
      return jsonResponse({ status: 'success', message: 'Added entry to ' + sheetName + ' at row ' + targetRow });
    }

    // -------------------------------------------------------------
    // ACTION 2: DELETE AN ENTRY FROM GOOGLE SHEET (ROW 5 ONWARDS)
    // -------------------------------------------------------------
    if (data.action === 'delete_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet && data.name) {
        var values = sheet.getDataRange().getValues();
        var targetName = String(data.name).trim().toLowerCase();
        // Check rows 5 onwards (0-indexed: r >= 4) so rows 1 to 4 are never touched
        for (var r = values.length - 1; r >= 4; r--) {
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
    // ACTION 3: BATCH PUSH ALL WEBSITE DATA TO SPREADSHEET (STARTS AT ROW 5)
    // -------------------------------------------------------------
    if (data.action === 'batch_sync') {
      var contributors = data.contributors || [];
      var expenses = data.expenses || [];

      // Update Expenses (Item 1 on row 4, Item 2 on row 5, row 3 is header)
      var expSheet = ss.getSheetByName('Expense Tracker');
      if (expSheet && expenses.length > 0) {
        expenses.forEach(function(item) {
          if (item.id >= 1 && item.id <= 12) {
            var rowNum = item.id + 3;
            if (item.vendorName !== undefined) expSheet.getRange(rowNum, 3).setValue(item.vendorName);
            if (item.budget !== undefined) expSheet.getRange(rowNum, 4).setValue(item.budget);
            if (item.advance !== undefined) expSheet.getRange(rowNum, 5).setValue(item.advance);
            if (item.totalPaid !== undefined) expSheet.getRange(rowNum, 6).setValue(item.totalPaid);
          }
        });
      }

      // Group contributors by section and write strictly starting at Row 5
      for (var p = 1; p <= 7; p++) {
        var sName = getSheetNameForParaId(p);
        var sSheet = ss.getSheetByName(sName);
        if (!sSheet) continue;

        var entries = contributors.filter(function(c) { return Number(c.paraId) === p; });
        if (entries.length > 0) {
          // Clear previous data rows from Row 5 onwards (never touch Row 4 - phone number row)
          var currentLast = sSheet.getLastRow();
          if (currentLast >= 5) {
            sSheet.getRange(5, 1, Math.max(currentLast - 4, entries.length + 10), 8).clearContent();
          }

          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var rowNum = 5 + i; // Strictly Row 5 onwards!
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

      return jsonResponse({
        status: 'success',
        message: 'Successfully batch-synced ' + contributors.length + ' entries (starting from Row 5) and ' + expenses.length + ' expenses.'
      });
    }

    // -------------------------------------------------------------
    // ACTION 4: UPDATE EXPENSE
    // -------------------------------------------------------------
    if (data.action === 'update_expense') {
      var sheet = ss.getSheetByName('Expense Tracker');
      if (sheet && data.id) {
        var rowNum = data.id + 3;
        if (data.vendorName !== undefined) sheet.getRange(rowNum, 3).setValue(data.vendorName);
        if (data.budget !== undefined) sheet.getRange(rowNum, 4).setValue(data.budget);
        if (data.advance !== undefined) sheet.getRange(rowNum, 5).setValue(data.advance);
        if (data.totalPaid !== undefined) sheet.getRange(rowNum, 6).setValue(data.totalPaid);
      }
      return jsonResponse({ status: 'success', message: 'Expense updated' });
    }

    // -------------------------------------------------------------
    // ACTION 5: UPDATE COLLECTION ENTRY IN GOOGLE SHEET
    // -------------------------------------------------------------
    if (data.action === 'update_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet && (data.oldName || data.donorName || data.familyHeadName || data.shopName || data.eventSpotType)) {
        var values = sheet.getDataRange().getValues();
        var targetName = String(data.oldName || data.donorName || data.familyHeadName || data.shopName || data.eventSpotType || '').trim().toLowerCase();
        // Check rows 5 onwards (0-indexed: r >= 4)
        for (var r = 4; r < values.length; r++) {
          var rowName1 = String(values[r][1] || '').trim().toLowerCase();
          var rowName2 = String(values[r][2] || '').trim().toLowerCase();
          if (rowName1 === targetName || rowName2 === targetName) {
            var rowNum = r + 1;
            if (data.paraId >= 1 && data.paraId <= 5) {
              sheet.getRange(rowNum, 2).setValue(data.familyHeadName || data.donorName || '');
              if (data.targetAmount !== undefined) sheet.getRange(rowNum, 3).setValue(Number(data.targetAmount) || 0);
              if (data.collectedAmount !== undefined) sheet.getRange(rowNum, 4).setValue(Number(data.collectedAmount) || 0);
              if (data.dueBalance !== undefined) sheet.getRange(rowNum, 5).setValue(Number(data.dueBalance) || 0);
              if (data.paymentMode) sheet.getRange(rowNum, 6).setValue(data.paymentMode);
              if (data.dateOfPayment || data.date) sheet.getRange(rowNum, 7).setValue(data.dateOfPayment || data.date);
              if (data.collectedBy) sheet.getRange(rowNum, 8).setValue(data.collectedBy);
            } else if (data.paraId === 6) {
              sheet.getRange(rowNum, 2).setValue(data.shopName || data.donorName || '');
              if (data.marketLocation !== undefined) sheet.getRange(rowNum, 3).setValue(data.marketLocation);
              if (data.agreedTarget !== undefined) sheet.getRange(rowNum, 4).setValue(Number(data.agreedTarget) || 0);
              if (data.amountPaid !== undefined) sheet.getRange(rowNum, 5).setValue(Number(data.amountPaid) || 0);
              if (data.dueBalance !== undefined) sheet.getRange(rowNum, 6).setValue(Number(data.dueBalance) || 0);
              if (data.paymentMode) sheet.getRange(rowNum, 7).setValue(data.paymentMode);
              if (data.date) sheet.getRange(rowNum, 8).setValue(data.date);
            } else if (data.paraId === 7) {
              if (data.date) sheet.getRange(rowNum, 2).setValue(data.date);
              sheet.getRange(rowNum, 3).setValue(data.eventSpotType || data.donorName || '');
              if (data.totalCollection !== undefined) sheet.getRange(rowNum, 4).setValue(Number(data.totalCollection) || 0);
              if (data.leadVolunteer) sheet.getRange(rowNum, 5).setValue(data.leadVolunteer);
              if (data.handedOverTo) sheet.getRange(rowNum, 6).setValue(data.handedOverTo);
            }
            break;
          }
        }
      }
      return jsonResponse({ status: 'success', message: 'Collection entry updated in ' + sheetName });
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
