from flask import Flask, render_template, request, jsonify, redirect
import requests
import os
import logging
import json
import re  # Add this import
import base64
from urllib.parse import urlencode

app = Flask(__name__)

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

CLAUDE_API_KEY = os.environ.get('CLAUDE_API_KEY')
CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

SPOTIFY_CLIENT_ID = '0568b723e6134b0fa22bab9c9e126e00'
SPOTIFY_CLIENT_SECRET = 'c65862a621af40e5bf70c7d3c6c33109'
SPOTIFY_REDIRECT_URI = 'http://localhost:5000/callback'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_playlist', methods=['POST'])
def generate_playlist():
    data = request.json
    birth_month = data['birthMonth']
    birth_year = data['birthYear']
    country = data['country']

    # Construct the date of birth string
    dob = f"{birth_year}-{birth_month}-01"  # Using the first day of the month

    prompt = f"""Given the birth date {dob} and country {country}, generate a playlist of popular songs that are significant to the person's life:

1. Songs from the year they turned 13 (coming of age)
2. Songs from the year they turned 18 (legal adulthood in many countries)
3. Songs from the year they turned 21 (another milestone of adulthood)
4. Songs from the year they turned 30 (entering a new decade of life)
5. Songs from the year they turned 40 (mid-life milestone)
6. Songs related to significant global or national events that occurred during their lifetime, such as:
   - Major sporting events (Olympics, World Cup, etc.)
   - Political milestones (elections, treaties, etc.)
   - Cultural phenomena (movie releases, technology launches, etc.)
7. Songs popular when they likely finished secondary school (around age 18)
8. Songs popular when they likely finished university (around age 21-22)

For each song, provide the following information in a structured format:
- Year of release
- Song title
- Artist
- Brief explanation of why it's significant

Please format your response as a JSON array of objects, where each object represents a song and contains the fields: "year", "title", "artist", and "significance".

Example format:
[
  {{
    "year": "1990",
    "title": "Example Song",
    "artist": "Example Artist",
    "significance": "Top chart hit when you turned 18"
  }},
  ...
]

Ensure the playlist is diverse in genres and eras, reflecting the person's life journey and cultural context of {country}. The songs should be listed in chronological order by the year of release."""

    if not CLAUDE_API_KEY:
        logger.error("Claude API key is missing")
        return jsonify({'error': 'API key is not configured'}), 500

    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
    }

    payload = {
        'model': 'claude-3-opus-20240229',
        'max_tokens': 1000,
        'messages': [
            {'role': 'user', 'content': prompt}
        ]
    }

    try:
        logger.debug(f"Sending request to Claude API with headers: {headers}")
        logger.debug(f"Request payload: {json.dumps(payload, indent=2)}")

        response = requests.post(CLAUDE_API_URL, headers=headers, json=payload, timeout=30)
        
        logger.debug(f"API Response Status: {response.status_code}")
        logger.debug(f"API Response Headers: {json.dumps(dict(response.headers), indent=2)}")
        logger.debug(f"API Response Body: {response.text}")
        
        if response.status_code != 200:
            error_data = response.json()
            error_message = error_data.get('error', {}).get('message', 'Unknown error occurred')
            error_type = error_data.get('error', {}).get('type', 'UnknownError')
            logger.error(f"API request failed: {error_type} - {error_message}")
            return jsonify({'error': f'Failed to generate playlist: {error_type} - {error_message}'}), response.status_code
        
        response_data = response.json()
        
        if 'content' in response_data and len(response_data['content']) > 0:
            playlist_text = response_data['content'][0]['text']
            # Extract JSON from the response
            json_match = re.search(r'\[.*\]', playlist_text, re.DOTALL)
            if json_match:
                playlist_json = json.loads(json_match.group())
                # Sort the playlist by year
                playlist_json.sort(key=lambda x: int(x['year']))
                logger.info(f"Successfully generated playlist for DOB: {dob}, Country: {country}")
                return jsonify({'playlist': playlist_json})
            else:
                logger.error("Could not extract JSON from the API response")
                return jsonify({'error': 'Failed to parse playlist data'}), 500
        else:
            logger.error(f"Unexpected API response structure: {response_data}")
            return jsonify({'error': 'Unexpected API response structure'}), 500
    
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return jsonify({'error': f'Failed to generate playlist: {str(e)}'}), 500
    
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {str(e)}")
        return jsonify({'error': 'Failed to parse playlist data'}), 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred'}), 500

@app.route('/callback')
def callback():
    code = request.args.get('code')
    if code:
        return render_template('callback.html', code=code)
    else:
        return "Authorization failed", 400

@app.route('/create_spotify_playlist', methods=['POST'])
def create_spotify_playlist():
    data = request.json
    code = data.get('code')
    playlist = data.get('playlist')

    if not code or not playlist:
        return jsonify({'error': 'Missing code or playlist data'}), 400

    # Exchange the code for an access token
    token_url = 'https://accounts.spotify.com/api/token'
    authorization = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    headers = {
        'Authorization': f'Basic {authorization}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': SPOTIFY_REDIRECT_URI
    }
    
    try:
        response = requests.post(token_url, headers=headers, data=data)
        response.raise_for_status()
        
        access_token = response.json()['access_token']
        
        # Create a new playlist
        user_profile_url = 'https://api.spotify.com/v1/me'
        headers = {'Authorization': f'Bearer {access_token}'}
        response = requests.get(user_profile_url, headers=headers)
        response.raise_for_status()

        user_id = response.json()['id']
        create_playlist_url = f'https://api.spotify.com/v1/users/{user_id}/playlists'
        playlist_data = {
            'name': 'My Buttercup Playlist',
            'description': 'A personalized playlist generated by Buttercup',
            'public': False
        }
        response = requests.post(create_playlist_url, headers=headers, json=playlist_data)
        response.raise_for_status()

        playlist_id = response.json()['id']
        playlist_url = response.json()['external_urls']['spotify']

        # Search for tracks and add them to the playlist
        search_url = 'https://api.spotify.com/v1/search'
        add_tracks_url = f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks'
        
        track_uris = []
        for song in playlist:
            query = f"track:{song['title']} artist:{song['artist']}"
            params = {'q': query, 'type': 'track', 'limit': 1}
            response = requests.get(search_url, headers=headers, params=params)
            response.raise_for_status()
            
            if response.json()['tracks']['items']:
                track_uri = response.json()['tracks']['items'][0]['uri']
                track_uris.append(track_uri)

        if track_uris:
            response = requests.post(add_tracks_url, headers=headers, json={'uris': track_uris})
            response.raise_for_status()

        return jsonify({'success': True, 'playlistUrl': playlist_url, 'message': f'Successfully created playlist with {len(track_uris)} tracks'})

    except requests.exceptions.RequestException as e:
        logger.error(f"Spotify API error: {str(e)}")
        logger.error(f"Response content: {e.response.text if e.response else 'N/A'}")
        return jsonify({'error': f'Spotify API error: {str(e)}'}), 500
    
if __name__ == '__main__':
    app.run(debug=True)