/**
 * =========================================================================
 * NEIGHBOURHOOD CLUB 🔥 KALI PUJA 2026
 * 2-WAY AUTOMATIC GOOGLE APPS SCRIPT WEBHOOK (FULL MULTI-TAB ENGINE)
 * =========================================================================
 * How to Install:
 * 1. Open your Google Spreadsheet (https://docs.google.com/spreadsheets/d/1bTBdyhZaQczAivGacAVuHiwwjnxkikaEeQJaCoeRmTE/edit)
 * 2. Click Extensions ➔ Apps Script.
 * 3. Delete any text in Code.gs, paste this entire file, and click Save (💾).
 * 4. Click Deploy ➔ Manage deployments ➔ Edit (pencil icon) ➔ New version ➔ Deploy.
 *    (OR Deploy ➔ New deployment ➔ Web app ➔ Who has access: Anyone ➔ Deploy).
 * 5. Copy the Web App URL and paste it into the website Admin Panel or Push modal!
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', message: 'No POST data received' });
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // -------------------------------------------------------------
    // ACTION 1: ADD / MERGE SINGLE ENTRY (STARTS AT ROW 5)
    // -------------------------------------------------------------
    if (data.action === 'add_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return jsonResponse({ status: 'error', message: 'Sheet not found: ' + sheetName });

      var targetRow = -1;
      var lastRow = sheet.getLastRow();
      var inputName = String(data.familyHeadName || data.shopName || data.eventSpotType || data.donorName || '').trim().toLowerCase();

      // Check if entry already exists on Row 5 onwards - if so, update in-place to prevent double entry!
      if (lastRow >= 5 && inputName) {
        var colIdx = (data.paraId === 7) ? 3 : 2; // Column B for Para 1-6, Column C for Road
        var existingNames = sheet.getRange(5, colIdx, lastRow - 4, 1).getValues();
        for (var r = 0; r < existingNames.length; r++) {
          if (String(existingNames[r][0] || '').trim().toLowerCase() === inputName) {
            targetRow = 5 + r;
            break;
          }
        }
      }

      // If not existing, find first empty row starting strictly from Row 5 (Row 4 is reserved for phone/collector header)
      if (targetRow === -1) {
        targetRow = 5;
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
      return jsonResponse({ status: 'success', message: 'Saved entry to ' + sheetName + ' at row ' + targetRow });
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
    // ACTION 3: FULL BATCH PUSH (ALL TABS: ROW 4 EXPENSES, ROW 5 COLLECTIONS, AND DASHBOARD)
    // -------------------------------------------------------------
    if (data.action === 'batch_sync') {
      var rawContributors = data.contributors || [];
      var expenses = data.expenses || [];
      var income = data.income || [];

      // 1. Deduplicate contributors
      var cleanContributors = [];
      var seenContrib = {};
      for (var cIdx = 0; cIdx < rawContributors.length; cIdx++) {
        var cItem = rawContributors[cIdx];
        var cName = String(cItem.familyHeadName || cItem.shopName || cItem.eventSpotType || cItem.donorName || '').trim().toLowerCase();
        if (!cName) continue;
        var cKey = cItem.paraId + '_' + cName;
        if (!seenContrib[cKey]) {
          seenContrib[cKey] = true;
          cleanContributors.push(cItem);
        }
      }

      // 2. PUSH EXPENSES: STRICTLY ROW 4 FOR EXPENSE TRACKER TAB
      // Row 1: Title, Row 2: Info, Row 3: Table Header, Row 4: Item 1 (Light & Electricals)
      var expSheet = ss.getSheetByName('Expense Tracker');
      if (expSheet && expenses.length > 0) {
        expenses.forEach(function(item) {
          if (item.id >= 1 && item.id <= 12) {
            var rowNum = item.id + 3; // Item 1 -> Row 4; Item 12 -> Row 15
            if (item.vendorName !== undefined) expSheet.getRange(rowNum, 3).setValue(item.vendorName);
            if (item.budget !== undefined) expSheet.getRange(rowNum, 4).setValue(item.budget);
            if (item.advance !== undefined) expSheet.getRange(rowNum, 5).setValue(item.advance);
            if (item.totalPaid !== undefined) expSheet.getRange(rowNum, 6).setValue(item.totalPaid);
            // Auto-calculate remaining due on Row
            var b = Number(item.budget) || 0;
            var p = Number(item.totalPaid) || 0;
            expSheet.getRange(rowNum, 7).setValue(Math.max(0, b - p));
          }
        });
      }

      // 3. PUSH COLLECTIONS: STRICTLY ROW 5 FOR PARA 1-5, SHOP, ROAD TABS
      var sectionSums = {};
      for (var s = 1; s <= 7; s++) {
        sectionSums[s] = { target: 0, collected: 0 };
      }

      for (var p = 1; p <= 7; p++) {
        var sName = getSheetNameForParaId(p);
        var sSheet = ss.getSheetByName(sName);
        if (!sSheet) continue;

        var entries = cleanContributors.filter(function(c) { return Number(c.paraId) === p; });
        var currentLast = sSheet.getLastRow();

        if (entries.length > 0) {
          // Clear previous data rows from Row 5 onwards (never touch Row 4 - phone/header row)
          if (currentLast >= 5) {
            sSheet.getRange(5, 1, Math.max(currentLast - 4, entries.length + 10), 8).clearContent();
          }

          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var rowNum = 5 + i; // Strictly Row 5 onwards!
            if (p >= 1 && p <= 5) {
              var tgt = Number(entry.targetAmount) || 0;
              var coll = Number(entry.collectedAmount) || Number(entry.amount) || 0;
              var due = Number(entry.dueBalance) || Math.max(0, tgt - coll);
              sectionSums[p].target += tgt;
              sectionSums[p].collected += coll;

              sSheet.getRange(rowNum, 1, 1, 8).setValues([[
                i + 1,
                entry.familyHeadName || entry.donorName || '',
                tgt,
                coll,
                due,
                entry.paymentMode || 'Cash',
                entry.dateOfPayment || entry.date || '',
                entry.collectedBy || ''
              ]]);
            } else if (p === 6) {
              var tgt = Number(entry.agreedTarget) || Number(entry.targetAmount) || 0;
              var paid = Number(entry.amountPaid) || Number(entry.amount) || 0;
              var due = Number(entry.dueBalance) || Math.max(0, tgt - paid);
              sectionSums[p].target += tgt;
              sectionSums[p].collected += paid;

              sSheet.getRange(rowNum, 1, 1, 8).setValues([[
                i + 1,
                entry.shopName || entry.donorName || '',
                entry.marketLocation || '',
                tgt,
                paid,
                due,
                entry.paymentMode || 'Cash',
                entry.date || ''
              ]]);
            } else if (p === 7) {
              var coll = Number(entry.totalCollection) || Number(entry.amount) || 0;
              sectionSums[p].collected += coll;

              sSheet.getRange(rowNum, 1, 1, 6).setValues([[
                i + 1,
                entry.date || '',
                entry.eventSpotType || entry.donorName || '',
                coll,
                entry.leadVolunteer || '',
                entry.handedOverTo || ''
              ]]);
            }
          }
        }
      }

      // 4. ALSO UPDATE "Dashboard & Summary" TAB IN GOOGLE SHEET
      var summarySheet = ss.getSheetByName('Dashboard & Summary');
      if (summarySheet) {
        var totalIncome = 0;
        var totalExpenses = 0;

        // Collection Rows 11 to 17
        for (var p = 1; p <= 7; p++) {
          var row = 10 + p; // Para 1 -> Row 11, Shop -> Row 16, Road -> Row 17
          var incItem = (income || []).find(function(item) { return item.id === p; }) || {};
          var tgt = sectionSums[p].target || Number(incItem.target) || 0;
          var coll = sectionSums[p].collected || Number(incItem.collected) || 0;
          var pending = Math.max(0, tgt - coll);

          totalIncome += coll;
          summarySheet.getRange(row, 3).setValue(tgt);
          summarySheet.getRange(row, 4).setValue(coll);
          summarySheet.getRange(row, 5).setValue(pending);
        }

        // Expense Rows 23 to 34
        if (expenses.length > 0) {
          expenses.forEach(function(exp) {
            if (exp.id >= 1 && exp.id <= 12) {
              var expRow = 22 + exp.id; // Item 1 -> Row 23, Item 12 -> Row 34
              var b = Number(exp.budget) || 0;
              var a = Number(exp.advance) || 0;
              var tp = Number(exp.totalPaid) || 0;
              var pd = Math.max(0, b - tp);
              totalExpenses += tp;

              summarySheet.getRange(expRow, 3).setValue(b);
              summarySheet.getRange(expRow, 4).setValue(a);
              summarySheet.getRange(expRow, 5).setValue(tp);
              summarySheet.getRange(expRow, 6).setValue(pd);
            }
          });
        }

        // KPI Summary Cards (Row 6)
        summarySheet.getRange(6, 2).setValue(totalIncome);
        summarySheet.getRange(6, 4).setValue(totalExpenses);
        summarySheet.getRange(6, 6).setValue(totalIncome - totalExpenses);

        // Row 18: Total Collection
        summarySheet.getRange(18, 4).setValue(totalIncome);
        // Row 35: Total Expenses
        summarySheet.getRange(35, 5).setValue(totalExpenses);
      }

      return jsonResponse({
        status: 'success',
        message: 'Successfully pushed all data to Google Sheet: Para 1-5, Shop, Road (Row 5+), Expenses (Row 4+), and Dashboard!'
      });
    }

    // -------------------------------------------------------------
    // ACTION 4: UPDATE EXPENSE (ROW 4 ONWARDS)
    // -------------------------------------------------------------
    if (data.action === 'update_expense') {
      var sheet = ss.getSheetByName('Expense Tracker');
      if (sheet && data.id) {
        var rowNum = data.id + 3; // Item 1 -> Row 4
        if (data.vendorName !== undefined) sheet.getRange(rowNum, 3).setValue(data.vendorName);
        if (data.budget !== undefined) sheet.getRange(rowNum, 4).setValue(data.budget);
        if (data.advance !== undefined) sheet.getRange(rowNum, 5).setValue(data.advance);
        if (data.totalPaid !== undefined) sheet.getRange(rowNum, 6).setValue(data.totalPaid);
      }
      return jsonResponse({ status: 'success', message: 'Expense updated at row ' + (data.id + 3) });
    }

    // -------------------------------------------------------------
    // ACTION 5: UPDATE COLLECTION ENTRY (ROW 5 ONWARDS)
    // -------------------------------------------------------------
    if (data.action === 'update_collection_entry') {
      var sheetName = getSheetNameForParaId(data.paraId);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet && (data.oldName || data.donorName || data.familyHeadName || data.shopName || data.eventSpotType)) {
        var values = sheet.getDataRange().getValues();
        var targetName = String(data.oldName || data.donorName || data.familyHeadName || data.shopName || data.eventSpotType || '').trim().toLowerCase();
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
