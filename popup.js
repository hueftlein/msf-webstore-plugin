const init = {
  headers: {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "sec-ch-ua":
      '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "x-app-version": "7.4.2",
    // "x-titan-token": ""
  },
  referrer: "https://marvelstrikeforce.com/",
  referrerPolicy: "strict-origin-when-cross-origin",
  body: null,
  method: "GET",
  mode: "cors",
  credentials: "include",
};

const fetchThrowOnError = async (input, init) =>
  new Promise((resolve, reject) => {
    fetch(input, init)
      .then((res) => {
        if (res.status >= 400) {
          reject(res);
        } else {
          resolve(res);
        }
      })
      .catch(reject);
  });

const getPLayerCard = async () =>
  fetchThrowOnError(
    "https://api-prod.marvelstrikeforce.com/services/api/getPlayerCard",
    init
  );

const getOffers = async () =>
  fetchThrowOnError(
    "https://api-prod.marvelstrikeforce.com/services/api/getOffers?lang=en",
    init
  );

const purchaseOffer = async ({ offerId, restUuid, userGuid }) => {
  fetchThrowOnError(
    `https://api-prod.marvelstrikeforce.com/services/api/offers/${offerId}/1/paymentLink?useCost=free&clickedLocation=web_standard&lang=en`,
    {
      ...init,
      method: "POST",
      body: JSON.stringify({
        offerChoice: 1,
        offerId,
        restUuid,
        userGuid,
      }),
    }
  );
};

const getMilestones = async () =>
  fetch(
    "https://api-prod.marvelstrikeforce.com/services/api/milestones?lang=en",
    init
  );

const claimMilestone = async (milestoneId, maxTier) => {
  fetch(
    `https://api-prod.marvelstrikeforce.com/services/api/milestone/${milestoneId}/claimAll/default/1/${maxTier}`,
    {
      ...init,
      method: "POST",
    }
  );
};

const spinner = (ready) => `<svg class="check ${
  ready ? "ready" : "progress"
}" width="20px" height="20px" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" xml:space="preserve">
    <circle id="circle" cx="50" cy="50" r="46" fill="transparent" />
    <polyline id="tick" points="25,55 45,70 75,33" fill="transparent" />
</svg>`;

const updateSpinner = (step, done) => {
  document.getElementById(`spinner-${step}`).innerHTML = `${spinner(done)}`;
};

const renderError = () => {
  document.getElementById(
    "error"
  ).innerHTML = `Error fetching data. Make sure you are logged in on <a href="https://marvelstrikeforce.com/en/store" target="_blank" rel="noopener noreferrer">https://marvelstrikeforce.com/en/store</a> and try again.`;
};

const catchError = (e) => {
  console.error(e);
  renderError();
};

const createSession = () =>
  new Promise((resolve, reject) => {
    return resolve();
    chrome.tabs
      .create({
        url: "https://marvelstrikeforce.com/",
        active: false,
      })
      .then((msfTab) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === msfTab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            window.setTimeout(() => {
              chrome.tabs.remove(tabId);
              resolve();
            }, 1000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      })
      .catch(reject);
  });

const renderUserCard = (playerCard) => {
  document.getElementById("user-card").innerHTML = `
        <img src="${playerCard.icon}">
        <img src="${playerCard.frame}">
    `;
};

const renderOffers = (offers, nTotal) => {
  document.getElementById("offers-info").innerHTML = `
    ${offers.length} free, ${nTotal} total.`;
  document.getElementById("offers").innerHTML = offers
    .map((freeOffer, i) => {
      return `
    <li>
        <div>
            Claiming ${freeOffer.name}
            <div id="spinner-offers-${i}"></div>
        </div>
    </li>`;
    })
    .join("");
};

const getClaimableTiers = (milestone) =>
  milestone.milestone.brackets.find((bracket) => bracket.id === "default")
    ?.objective.progress.claimableTiers;

const renderMilestones = (milestones) => {
  document.getElementById("milestones").innerHTML = milestones
    .map((milestone, i) => {
      const claimableTiers = getClaimableTiers(milestone);
      const info = claimableTiers?.length
        ? `claiming tier(s) ${claimableTiers.join(", ")}`
        : "no claimable tiers";
      return `
      <li>
          <div>
              <a href="https://marvelstrikeforce.com/en/milestones/${milestone.id}" target="_blank" rel="noopener noreferrer">${milestone.name}</a> - ${info}
              <div id="spinner-milestones-${i}"></div>
          </div>
      </li>`;
    })
    .join("");
};

const onGetOffers = (playerCard) => (res) => {
  res
    .json()
    .then((offers) => {
      updateSpinner("offers", true);
      const freeOffers = offers.filter((offer) =>
        offer.choices.find((choice) => choice.freeCost)
      );
      renderOffers(freeOffers, offers.length);
      freeOffers.forEach((freeOffer, i) => {
        if ((freeOffer.remainingPurchases = 0)) {
          updateSpinner(`offers-${i}`, true);
        } else {
          purchaseOffer({
            offerId: freeOffer.id,
            restUuid: playerCard.user.restUuid,
            userGuid: playerCard.user.userGuid,
          })
            .then(() => updateSpinner(`offers-${i}`, true))
            .catch(catchError);
        }
      });
    })
    .catch(catchError);
};

const onGetMilestones = (res) => {
  res
    .json()
    .then(({ data: milestones }) => {
      updateSpinner("milestones", true);
      renderMilestones(milestones);
      milestones.forEach((milestone, i) => {
        const claimableTiers = getClaimableTiers(milestone);
        if (!claimableTiers?.length) {
          updateSpinner(`milestones-${i}`, true);
        } else {
          claimMilestone(milestone.id, claimableTiers.slice(-1))
            .catch(catchError)
            .then(() => updateSpinner(`milestones-${i}`, true));
        }
      });
    })
    .catch(catchError);
};

const onGetPLayerCard = (res) => {
  res
    .json()
    .then((playerCard) => {
      updateSpinner("player-card", true);
      renderUserCard(playerCard);
      updateSpinner("offers");
      getOffers().then(onGetOffers(playerCard)).catch(catchError);
      updateSpinner("milestones");
      getMilestones().then(onGetMilestones).catch(catchError);
    })
    .catch(catchError);
};

const onCreateSession = () => {
  updateSpinner("session", true);
  updateSpinner("player-card");
  getPLayerCard().then(onGetPLayerCard).catch(catchError);
};

const start = () => {
  updateSpinner("session");
  createSession().then(onCreateSession).catch(catchError);
};

start();
