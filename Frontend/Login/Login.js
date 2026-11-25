// ===== Login.js =====
// Used by Login.html (the login page in the top folder).

function login() {

  // 1. Get what the user typed
  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var errorMessage = document.getElementById("error-message");

  // 2. Check if both boxes are filled
  if (username == "" || password == "") {
    errorMessage.innerHTML = "Please enter your username and password.";
    return;
  }

  // 3. Check if the username and password are correct
  if (username == "admin" && password == "admin123") {
    // Correct! Go to the dashboard page.
    // (No "/" at the start: Login.html is in the top folder, so the path starts from there.)
    window.location.href = "Frontend/Dashboard/Dashboard.html";
  } else {
    // Wrong! Show an error message
    errorMessage.innerHTML = "Wrong username or password. Try again.";
  }
}

// Pressing Enter in the password box also signs in
document.getElementById("password").addEventListener("keydown", function (event) {
  if (event.key == "Enter") { login(); }
});

// IMPORTANT: there must be NO "window.location.href = ..." line out here,
// outside of the login() function. A line like that runs the moment the page
// opens and sends the page to itself again and again (endless loading).