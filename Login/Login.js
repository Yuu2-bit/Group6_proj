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
        // Correct! Go to the dashboard page
        window.location.href = "/Dashboard/Dashboard.html";
      } else {
        // Wrong! Show an error message
        errorMessage.innerHTML = "Wrong username or password. Try again.";
      }
    }