
var SUPABASE_URL = "https://qdqljodxhvxllldqzhof.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcWxqb2R4aHZ4bGxsZHF6aG9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzNzEwNjgsImV4cCI6MjExMDk0NzA2OH0.F4yoASDJ-UidPTTxWnSSlkecEpw9Dmni2CYPKpLhyfg";

var db = null;
var dbError = "";
var autoRefreshTimer = null;

if (SUPABASE_URL === "" || SUPABASE_KEY === "") {
    dbError = "The Supabase URL or key is empty.";
} else if (!window.supabase) {
    dbError = "The Supabase library did not load. Check your internet connection.";
} else {
    try {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        dbError = error.message;
    }
}

if (dbError !== "") {
    console.error("data.js: " + dbError);
}

var STATUS_LIST = [
    "For Checking",
    "In Repair",
    "Parts Available",
    "For Releasing Good",
    "Released",
    "Cancelled"
];

var SERVICE_LIST = [
    "Screen Repair",
    "Battery Replacement",
    "Laptop Repair",
    "Water Damage Fix",
    "Charging Port Repair",
    "Other"
];

function showDemoNotice() {
    if (db !== null || document.getElementById("db-notice")) {
        return;
    }

    var bar = document.createElement("div");

    bar.id = "db-notice";
    bar.textContent = "Not connected to the database. " + dbError;

    bar.style.cssText =
        "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:200;" +
        "max-width:90vw;padding:10px 16px;border-radius:8px;" +
        "border:1px solid #2f4268;background:#1a2842;color:#e8eef9;" +
        "font:500 13px Inter,Arial,sans-serif;text-align:center;";

    document.body.appendChild(bar);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", showDemoNotice);
} else {
    showDemoNotice();
}


// HELPER FUNCTIONS

function safe(text) {
    if (text == null || text === "") {
        return "—";
    }

    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function padNumber(n, size) {
    return String(n).padStart(size, "0");
}

function customerCode(c) {
    if (c.customer_code) {
        return c.customer_code;
    }

    return "CUST-" + padNumber(c.id, 6);
}

function jobCode(j) {
    return "JO-" + padNumber(j.id, 5);
}

function isOpen(j) {
    var status = String(j.status || "").trim().toLowerCase();

    return status !== "released" &&
        status !== "cancelled" &&
        status !== "canceled";
}

function toDate(dateText) {
    if (!dateText) {
        return null;
    }

    var d = new Date(dateText);

    return isNaN(d.getTime()) ? null : d;
}

function daysSince(dateText) {
    var d = toDate(dateText);

    if (d === null) {
        return 0;
    }

    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function formatDate(dateText) {
    var d = toDate(dateText);

    if (d === null) {
        return "—";
    }

    return padNumber(d.getMonth() + 1, 2) + "/" +
        padNumber(d.getDate(), 2) + "/" +
        d.getFullYear();
}

function formatDateTime(dateText) {
    var d = toDate(dateText);

    if (d === null) {
        return "—";
    }

    return d.toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getAging(j) {
    if (!isOpen(j)) {
        return null;
    }

    var days = daysSince(
        j.status_started || j.date_received || j.created_at
    );

    var level = "normal";

    if (days >= 8) {
        level = "critical";
    } else if (days >= 4) {
        level = "aging";
    }

    var word = days === 1 ? " day" : " days";

    return {
        days: days,
        level: level,
        text: days + word + " · " + level.toUpperCase()
    };
}


// GET CUSTOMERS

async function getCustomers() {
    if (db === null) {
        console.error(dbError);
        return [];
    }

    try {
        var r = await db
            .from("customers")
            .select("*")
            .order("name", { ascending: true })
            .limit(5000);

        if (r.error) {
            console.error("Get customers error:", r.error.message);
            return [];
        }

        return r.data || [];

    } catch (error) {
        console.error("Get customers error:", error);
        return [];
    }
}


// GET JOB ORDERS

async function getJobOrders() {
    if (db === null) {
        console.error(dbError);
        return [];
    }

    try {
        var r = await db
            .from("job_orders")
            .select("*, customers(id, name, customer_code)")
            .limit(5000);

        if (r.error) {
            console.error("Get job orders error:", r.error.message);
            return [];
        }

        var jobs = r.data || [];

        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];

            job.date_received =
                job.date_received ||
                job.created_at ||
                job.status_started ||
                null;

            job.status_started =
                job.status_started ||
                job.date_received;

            job.customer_name = job.customers
                ? job.customers.name
                : "—";

            job.customer_code = job.customers
                ? customerCode(job.customers)
                : "—";
        }

        jobs.sort(function (a, b) {
            return Number(b.id) - Number(a.id);
        });

        return jobs;

    } catch (error) {
        console.error("Get job orders error:", error);
        return [];
    }
}


// GET PAYMENTS

async function getPayments() {
    if (db === null) {
        console.error(dbError);
        return [];
    }

    try {
        var r = await db
            .from("payments")
            .select("*")
            .limit(5000);

        if (r.error) {
            console.error("Get payments error:", r.error.message);
            return [];
        }

        return r.data || [];

    } catch (error) {
        console.error("Get payments error:", error);
        return [];
    }
}


// ADD CUSTOMER AND JOB ORDER

async function addJobOrder(info) {
    if (db === null) {
        return dbError || "Database connection is not available.";
    }

    if (!info || !info.customerName || !info.device) {
        return "Customer name and device are required.";
    }

    try {
        var customerName = info.customerName.trim();
        var customerId = null;
        var existing = null;

        var customerResult = await db
            .from("customers")
            .select("*")
            .limit(5000);

        if (customerResult.error) {
            return "Unable to check customers: " +
                customerResult.error.message;
        }

        var customers = customerResult.data || [];

        for (var i = 0; i < customers.length; i++) {
            if (
                (customers[i].name || "").trim().toLowerCase() ===
                customerName.toLowerCase()
            ) {
                customerId = customers[i].id;
                existing = customers[i];
                break;
            }
        }

        if (customerId === null) {
            var newCustomer = {
                name: customerName,
                type: "Individual",
                contact: info.contact || null,
                address: info.address || null,
                status: "Active"
            };

            var customerInsert = await db
                .from("customers")
                .insert(newCustomer)
                .select()
                .single();

            if (customerInsert.error) {
                return "Unable to save customer: " +
                    customerInsert.error.message;
            }

            customerId = customerInsert.data.id;

        } else {
            var customerUpdate = {};

            if (info.address && !existing.address) {
                customerUpdate.address = info.address;
            }

            if (info.contact && !existing.contact) {
                customerUpdate.contact = info.contact;
            }

            if (Object.keys(customerUpdate).length > 0) {
                var updateCustomer = await db
                    .from("customers")
                    .update(customerUpdate)
                    .eq("id", customerId);

                if (updateCustomer.error) {
                    console.error(
                        "Customer update warning:",
                        updateCustomer.error.message
                    );
                }
            }
        }

        var now = new Date().toISOString();

        var newJobOrder = {
            customer_id: customerId,
            device: info.device,
            serial: info.serial || null,
            service: info.service || null,
            issue: info.issue || null,
            status: info.status || "For Checking",
            amount: Number(info.amount) || 0,
            date_received: info.date_received || now,
            status_started: now
        };

        if (info.received_by) {
            newJobOrder.received_by = info.received_by;
        }

        if (info.form_data) {
            newJobOrder.form_data = info.form_data;
        }

        var jobResult = await db
            .from("job_orders")
            .insert(newJobOrder)
            .select()
            .single();

        if (jobResult.error) {
            console.error(
                "Job order insert error:",
                jobResult.error.message
            );

            return jobResult.error.message;
        }

        return null;

    } catch (error) {
        console.error("Add job order error:", error);

        return error.message || "An unexpected error occurred.";
    }
}


// UPDATE JOB ORDER STATUS

async function updateJobStatus(id, status) {
    if (db === null) {
        return dbError || "Database connection is not available.";
    }

    if (!id || !status) {
        return "Job order ID and status are required.";
    }

    try {
        var r = await db
            .from("job_orders")
            .update({
                status: status,
                status_started: new Date().toISOString()
            })
            .eq("id", id)
            .select("id")
            .maybeSingle();

        if (r.error) {
            return r.error.message;
        }

        if (!r.data) {
            return "Job order was not found.";
        }

        return null;

    } catch (error) {
        console.error("Update job status error:", error);

        return error.message || "Unable to update job status.";
    }
}


// DELETE CUSTOMER

async function deleteCustomer(id, deleteJobs) {
    if (db === null) {
        return dbError || "Database connection is not available.";
    }

    if (!id) {
        return "Customer ID is required.";
    }

    try {
        if (deleteJobs) {
            var jobResult = await db
                .from("job_orders")
                .delete()
                .eq("customer_id", id);

            if (jobResult.error) {
                return "Unable to delete job orders: " +
                    jobResult.error.message;
            }
        }

        var r = await db
            .from("customers")
            .delete()
            .eq("id", id)
            .select("id");

        if (r.error) {
            return r.error.message;
        }

        if (!r.data || r.data.length === 0) {
            return "Customer was not found.";
        }

        return null;

    } catch (error) {
        console.error("Delete customer error:", error);

        return error.message || "Unable to delete customer.";
    }
}


// AUTOMATIC REFRESH

function autoRefresh(fn) {
    window.removeEventListener("focus", fn);
    window.addEventListener("focus", fn);

    if (autoRefreshTimer !== null) {
        clearInterval(autoRefreshTimer);
    }

    autoRefreshTimer = setInterval(function () {
        if (!document.hidden) {
            fn();
        }
    }, 10000);
}
