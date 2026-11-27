function login() {

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var errorMessage = document.getElementById("error-message");


  if (username == "" || password == "") {
    errorMessage.innerHTML = "Please enter your username and password.";
    return;
  }


  if (username == "admin" && password == "admin123") {
    window.location.href = "Frontend/Dashboard/Dashboard.html";
  } else {

    errorMessage.innerHTML = "Wrong username or password. Try again.";
  }
}

document.getElementById("password").addEventListener("keydown", function (event) {
  if (event.key == "Enter") { login(); }
});