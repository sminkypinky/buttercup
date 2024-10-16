let generatedPlaylist = null;
let isGenerating = false;
let controller = null;
let paymentOK = false;

document.getElementById('playlist-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isGenerating) {
        saveFormData();
        const birthMonth = document.getElementById('birth-month').value;
        const birthYear = document.getElementById('birth-year').value;
        const country = document.getElementById('country').value;
        const genre = document.getElementById('genre').value;
        if (genre === 'other') genre = document.getElementById('customGenre').value;
        await generatePlaylist(birthMonth, birthYear, country, genre);
    }
});

document.getElementById('create-spotify-playlist').addEventListener('click', async () => {
    if (!generatedPlaylist) {
        alert('Please generate a playlist first.');
        return;
    }

    try {
        const response = await fetch('/get_spotify_auth_url');
        const data = await response.json();
        
        if (data.authUrl) {
            const authWindow = window.open(data.authUrl, 'Spotify Authorization', 'width=800,height=600');
            showModal('Authorizing with Spotify...');

            window.addEventListener('message', async (event) => {
                if (event.origin !== window.location.origin) return;

                if (event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
                    authWindow.close();
                    const code = event.data.code;

                    updateModal('Creating playlist on Spotify...');

                    try {
                        const response = await fetch('/create_spotify_playlist', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                code: code,
                                playlist: generatedPlaylist
                            }),
                        });

                        const data = await response.json();

                        if (response.ok && data.success) {
                            updateModal(`
                                <p class="mb-4">${data.message}</p>
                                <p class="mb-4">Your playlist is ready! Click the button below to open it in Spotify:</p>
                                <a href="${data.playlistUrl}" target="_blank" class="spotify-button">Open in Spotify</a>
                            `);
                        } else {
                            throw new Error(data.error || 'Failed to create Spotify playlist');
                        }
                    } catch (error) {
                        console.error('Error creating Spotify playlist:', error);
                        updateModal(`Error creating Spotify playlist: ${error.message}`);
                    }
                } else if (event.data.type === 'SPOTIFY_AUTH_ERROR') {
                    console.error('Spotify authorization error:', event.data.error);
                    updateModal(`Spotify authorization failed: ${event.data.error}`);
                }
            }, false);
        } else {
            throw new Error('Failed to get Spotify authorization URL');
        }
    } catch (error) {
        console.error('Error initiating Spotify authorization:', error);
        updateModal(`Error: ${error.message}`);
    }
});

// Modal functions
function showModal(content) {
    document.querySelector('.modal').classList.remove('opacity-0', 'pointer-events-none');
    document.body.classList.add('modal-active');
    document.getElementById('modal-content').innerHTML = content;
}

function updateModal(content) {
    document.getElementById('modal-content').innerHTML = content;
}

function closeModal() {
    document.querySelector('.modal').classList.add('opacity-0', 'pointer-events-none');
    document.body.classList.remove('modal-active');
}

// Close modal when clicking outside or on close button
document.querySelectorAll('.modal-overlay, .modal-close').forEach(elem => {
    elem.addEventListener('click', closeModal);
});

const loadingMessages = [
"Tuning the time machine...",
"Dusting off vinyl records...",
"Untangling cassette tapes...",
"Polishing golden oldies...",
"Syncing with the rhythm of your life...",
"Decoding the musical DNA of your era...",
"Harmonizing your memories...",
"Composing your life's soundtrack...",
"Remixing the hits of your youth...",
"Orchestrating a symphony of nostalgia..."
];

let messageIndex = 0;
let messageInterval;

function rotateLoadingMessage() {
    const loadingMessageElement = document.getElementById('loading-message');
    messageIndex = (messageIndex + 1) % loadingMessages.length;
    loadingMessageElement.textContent = loadingMessages[messageIndex];
}

function startLoadingMessages() {
    messageInterval = setInterval(rotateLoadingMessage, 5000);
}

function stopLoadingMessages() {
    clearInterval(messageInterval);
}

// Function to save form data to localStorage
function saveFormData() {
    localStorage.setItem('birthMonth', document.getElementById('birth-month').value);
    localStorage.setItem('birthYear', document.getElementById('birth-year').value);
    localStorage.setItem('country', document.getElementById('country').value);
    localStorage.setItem('genre', document.getElementById('genre').value);
    localStorage.setItem('customGenre', document.getElementById('customGenre').value);
}

// Function to load form data from localStorage
function loadFormData() {
    const birthMonth = localStorage.getItem('birthMonth');
    const birthYear = localStorage.getItem('birthYear');
    const country = localStorage.getItem('country');
    const genre = localStorage.getItem('genre');
    const customGenre = localStorage.getItem('customGenre');

    if (birthMonth) document.getElementById('birth-month').value = birthMonth;
    if (birthYear) document.getElementById('birth-year').value = birthYear;
    if (country) document.getElementById('country').value = country;
    if (genre) document.getElementById('genre').value = genre;
    if (customGenre) document.getElementById('customGenre').value = customGenre;
}

// Load saved data and playlist when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadFormData();
    const savedPlaylist = loadGeneratedPlaylist();
    if (savedPlaylist) {
        generatedPlaylist = savedPlaylist;
        displayPlaylist(generatedPlaylist);
    }

    const genreSelect = document.getElementById('genre');
    const customGenreInput = document.getElementById('customGenre');
    genreSelect.addEventListener('change', function() {
        if (this.value === 'other') {
            customGenreInput.classList.remove('hidden');
        } else {
            customGenreInput.classList.add('hidden');
        }
        
    });
});

// Function to save the generated playlist
function saveGeneratedPlaylist(playlist) {
    localStorage.setItem('generatedPlaylist', JSON.stringify(playlist));
}

// Function to load the generated playlist
function loadGeneratedPlaylist() {
    const savedPlaylist = localStorage.getItem('generatedPlaylist');
    return savedPlaylist ? JSON.parse(savedPlaylist) : null;
}

// Function to display the playlist
function displayPlaylist(playlist) {
    const playlistElement = document.getElementById('playlist');
    playlistElement.innerHTML = ''; // Clear previous results
    playlist.forEach(song => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${song.year}</strong> - "${song.title}" by ${song.artist}
            <br>
            <span class="text-sm text-gray-600">${song.significance}</span>
        `;
        playlistElement.appendChild(li);
    });
    document.getElementById('result').classList.remove('hidden');
    showButtons();
}

// Function to handle playlist generation
async function generatePlaylist(birthMonth, birthYear, country, genre) {
    const errorElement = document.getElementById('error');

    errorElement.classList.add('hidden');
    showLoading();
    startLoadingMessages();

    try {
        controller = new AbortController();
        const signal = controller.signal;

        const response = await fetch('/generate_playlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ birthMonth, birthYear, country, genre }),
            signal: signal
        });

        const data = await response.json();

        if (response.ok && data.playlist) {
            generatedPlaylist = data.playlist;
            saveGeneratedPlaylist(generatedPlaylist);
            displayPlaylist(generatedPlaylist);
        } else {
            throw new Error(data.error || 'Failed to generate playlist');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted');
        } else {
            errorElement.textContent = `Error: ${error.message}`;
            errorElement.classList.remove('hidden');
        }
    } finally {
        hideLoading();
        stopLoadingMessages();
        controller = null;
    }
}

document.getElementById('regenerate-playlist').addEventListener('click', async () => {
    if (!isGenerating) {
        const birthMonth = document.getElementById('birth-month').value;
        const birthYear = document.getElementById('birth-year').value;
        const country = document.getElementById('country').value;
        const genre = document.getElementById('genre').value;
        if (genre === 'other') genre = document.getElementById('customGenre').value;
        await generatePlaylist(birthMonth, birthYear, country, genre);
    }
});

// Add event listener for the start over button
document.getElementById('start-over').addEventListener('click', () => {
    localStorage.removeItem('birthMonth');
    localStorage.removeItem('birthYear');
    localStorage.removeItem('country');
    localStorage.removeItem('generatedPlaylist');
    document.getElementById('birth-month').value = '';
    document.getElementById('birth-year').value = '';
    document.getElementById('country').value = '';
    document.getElementById('result').classList.add('hidden');
    document.getElementById('playlist').innerHTML = '';
    document.getElementById('error').classList.add('hidden');
});

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('generateButton').disabled = true;
    document.getElementById('generateButtonAd').disabled = true;
    hideButtons();
    document.getElementById('cancel-generation').classList.remove('hidden');
    isGenerating = true;
    document.getElementById('loading').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('submit-btn').disabled = false;
    showButtons();
    document.getElementById('cancel-generation').classList.add('hidden');
    isGenerating = false;
}

// Add event listener for the cancel button
document.getElementById('cancel-generation').addEventListener('click', () => {
    if (controller) {
        controller.abort();
        hideLoading();
        stopLoadingMessages();
    }
});

function updateSubmitButtonState(disabled) {
    const submitButton = document.getElementById('submit-btn');
    submitButton.disabled = disabled;
    if (disabled) {
        submitButton.textContent = 'Generating...';
    } else {
        submitButton.textContent = 'Generate My Playlist';
    }
}

function showButtons() {
    document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('hidden'));
}

function hideButtons() {
    document.querySelectorAll('.btn').forEach(btn => btn.classList.add('hidden'));
}

document.getElementById('generateButton').addEventListener('click', async (e) => {
    e.preventDefault();

    saveFormData();

    const country = await getUserCountry();

    controller = new AbortController();
    const signal = controller.signal;

    const response = await fetch('/create_payment_session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ country }),
        signal: signal
    });

    const data = await response.json();

    if (data.redirect_url) {
        if (data.redirect_url) {
            window.location.href = data.redirect_url;
        } else {
            console.error('Failed to create payment session');
          }
    } else {
        console.error('Failed to create payment session');
    }
      
  });

  // Check if the payment was successful
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment') === 'success') {
    document.getElementById('submit-btn').classList.remove('hidden');
    document.getElementById('payments').classList.add('hidden');
    document.getElementById('regenerate-playlist').classList.remove('hidden');
    
  }

  // Function to get user's country
  async function getUserCountry() {
    try {
      const response = await axios.get('https://ipapi.co/json/');
      return response.data.country_code;
    } catch (error) {
      console.error('Error fetching user country:', error);
      return 'default';
    }
  }

  // Function to update price display
  async function updatePriceDisplay() {
    const country = await getUserCountry();
    try {
      const response = await axios.get(`/get_price?country=${country}`);
      document.getElementById('priceDisplay1').textContent = response.data.display;
      document.getElementById('priceDisplay2').textContent = response.data.display;
    } catch (error) {
      console.error('Error fetching price:', error);
      document.getElementById('priceDisplay1').textContent = '£2.99';
      document.getElementById('priceDisplay2').textContent = '£2.99';
    }
  }

  // Update price display when page loads
  updatePriceDisplay();

document.querySelector('.modal-close').addEventListener('click', function() {
    document.getElementById('paymentModal').classList.add('opacity-0', 'pointer-events-none');
});

function showAd() {
    (function(__htavim){
    var d = document,
        s = d.createElement('script'),
        l = d.scripts[d.scripts.length - 1];
    s.settings = __htavim || {};
    s.src = "\/\/knownamount.com\/dzm.FWzydWGGlNt\/Pz3Fp\/vcbymFVSJ\/ZnDj0E1\/NnjTU\/3\/MwTaIu4MLqTHUI2\/NyTfcxxQMwjNkS";
    s.referrerPolicy = 'no-referrer-when-downgrade';
    s.async = true;
    l.parentNode.insertBefore(s, l);
    })();

    // You might need to run this after a slight delay or when you're sure the ad has loaded
    setTimeout(initializeVideoJSListener, 1000); // Adjust timeout as needed
}

// Function to initialize event listening on Video.js player
function initializeVideoJSListener() {
    // HilltopAds might create the Video.js player with a specific ID or class
    // You may need to adjust this selector
    const playerElement = document.querySelector('.video-js');
    
    if (playerElement && window.videojs) {
        const player = videojs(playerElement);

        // Listen for the 'ended' event
        player.on('ended', function() {
            console.log('HilltopAds video ad has ended');
            // Your code to handle the ad ending goes here
            // For example, you might want to show some content or remove the ad container
            document.getElementById('submit-btn').click();
        });

        // You might also want to listen for other events
        player.on('play', function() {
            console.log('HilltopAds video ad started playing');
        });

        player.on('pause', function() {
            console.log('HilltopAds video ad was paused');
        });

        // If you need to check the current state
        if (player.ended()) {
            console.log('HilltopAds video ad has already ended');
            // Handle case where video has already ended
        }
    } else {
        console.log('Video.js player not found or Video.js library not loaded');
    }
}

document.getElementById('generateButtonAd').addEventListener('click', async (e) => {
    e.preventDefault();

    saveFormData();

    showAd();
      
  });