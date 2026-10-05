const splashScreen =
    document.getElementById("splashScreen");

const welcomeScreen =
    document.getElementById("welcomeScreen");


window.addEventListener("load", () => {

    setTimeout(() => {

        splashScreen.classList.add(
            "splash-hidden"
        );

        welcomeScreen.classList.add(
            "welcome-visible"
        );

    }, 5000);

});
