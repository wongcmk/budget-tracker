let transactions = [];
let myChart;

fetch("/api/transaction")
  .then(response => {
    return response.json();
  })
  .then(data => {
    // save db data on global variable
    transactions = data;

    populateTotal();
    populateTable();
    populateChart();
  });

function populateTotal() {
  // reduce transaction amounts to a single total value
  let total = transactions.reduce((total, t) => {
    return total + parseInt(t.value);
  }, 0);

  let totalEl = document.querySelector("#total");
  totalEl.textContent = total;
}

function populateTable() {
  let tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  transactions.forEach(transaction => {
    // create and populate a table row
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

    tbody.appendChild(tr);
  });
}

function populateChart() {
  // copy array and reverse it
  let reversed = transactions.slice().reverse();
  let sum = 0;

  // create date labels for chart
  let labels = reversed.map(t => {
    let date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });

  // create incremental values for chart
  let data = reversed.map(t => {
    sum += parseInt(t.value);
    return sum;
  });

  // remove old chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  let ctx = document.getElementById("myChart").getContext("2d");

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: "Total Over Time",
        fill: true,
        backgroundColor: "#6666ff",
        data
      }]
    }
  });
}

function sendTransaction(isAdding) {
  let nameEl = document.querySelector("#t-name");
  let amountEl = document.querySelector("#t-amount");
  let errorEl = document.querySelector(".form .error");

  // validate form
  if (nameEl.value === "" || amountEl.value === "") {
    errorEl.textContent = "Missing Information";
    return;
  }
  else {
    errorEl.textContent = "";
  }

  // create record
  let transaction = {
    name: nameEl.value,
    value: amountEl.value,
    date: new Date().toISOString()
  };

  // if subtracting funds, convert amount to negative number
  if (!isAdding) {
    transaction.value *= -1;
  }

  // add to the start of current array of data
  transactions.unshift(transaction);

  // re-run logic to populate ui with new record
  populateChart();
  populateTable();
  populateTotal();

  // also send to server
  fetch("/api/transaction", {
    method: "POST",
    body: JSON.stringify(transaction),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  })
    .then(response => {
      return response.json();
    })
    .then(data => {
      if (data.errors) {
        errorEl.textContent = "Missing Information";
      }
      else {
        // clear form
        nameEl.value = "";
        amountEl.value = "";
      }
    })
    .catch(err => {
      // fetch failed, so save in indexed db
      saveRecord(transaction);

      // clear form
      nameEl.value = "";
      amountEl.value = "";
    });
}

document.querySelector("#add-btn").onclick = function () {
  sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function () {
  sendTransaction(false);
};


function showPending() {
  // open a transaction on your pending db
  const transaction = db.transaction(["pending"], "readwrite");
  // access the  pending object store
  const pendingStore = transaction.objectStore("pending");
  // get all records from store and set to a variable
  const getAll = pendingStore.getAll();
  // console.log("pending", getAll);

  getAll.onsuccess = function () {
    if (getAll.result.length > 0) {
      getAll.result.forEach(pendingTransaction => {
        // add to beginning of current array of data
        transactions.unshift(pendingTransaction);
      });

      // re-run logic to populate ui with new record
      populateChart();
      populateTable();
      populateTotal();
    }
  }
}

let db;
// create a new db request for a "budget" database.
const request = window.indexedDB.open("budget");

request.onupgradeneeded = function (event) {
  // create object stored in "pending" and set autoIncrement to true
  const db = event.target.result;
  const pendingStore = db.createObjectStore("pending", { keyPath: "pendingID", autoIncrement: true });
  // console.log(pendingStore);
};

request.onsuccess = function (event) {
  db = event.target.result;
  // console.log(db);
  if (navigator.onLine) {
    checkDatabase();
  } else {
    showPending();
  }
};

request.onerror = function (event) {
  // log error here
  console.log(event);
};

function saveRecord(record) {
  // create a transaction on the pending db with readwrite access
  const transaction = db.transaction(["pending"], "readwrite");
  // access the pending object store
  const pendingStore = transaction.objectStore("pending");
  // add record to the store with add method.
  pendingStore.add(record);
}

function checkDatabase() {
  // open a transaction on the pending db
  const transaction = db.transaction(["pending"], "readwrite");
  // access the pending object store
  const pendingStore = transaction.objectStore("pending");
  // get all records from store and set a variable
  const getAll = pendingStore.getAll();
  // console.log(getAll);

  getAll.onsuccess = function () {
    if (getAll.result.length > 0) {
      fetch('/api/transaction/bulk', {
        method: 'POST',
        body: JSON.stringify(getAll.result),
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        },
      })
        .then((response) => response.json())
        .then(() => {
          // if successful, open a transaction on the pending db
          const emptyTransaction = db.transaction(["pending"], "readwrite");
          // access the pending object store
          const emptyPendingStore = emptyTransaction.objectStore("pending");
          // clear all items in the store
          emptyPendingStore.clear();
        });
    }
  };
}

// listen for app going online
window.addEventListener('online', checkDatabase);