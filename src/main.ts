require('dotenv').config();
const nodeFetch = require('node-fetch');

const fetchNewTokensFromFitbit = async () => {
  const basicToken = process.env.FITBIT_BASIC_TOKEN;
  if (!basicToken) {
    throw new Error('FITBIT_BASIC_TOKEN environment variable does not exist.');
  }

  const refreshToken = process.env.FITBIT_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('FITBIT_REFRESH_TOKEN environment variable does not exist.');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const response = await nodeFetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    body: params,
    headers: {
      'accept': 'application/json',
      'authorization': `Basic ${basicToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch new tokens from Fitbit. status: ${response.status}.`);
  }
  const json = await response.json();
  return [json.access_token, json.refresh_token];
};

const isLocal = () => process.env.IS_LOCAL === 'true';

const updateLocalDotEnvFile = async (newRefreshToken: string) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const envFilePath = path.resolve(__dirname, '../.env');
  const envVars = fs.readFileSync(envFilePath, 'utf-8').split(os.EOL);
  const newEnvVars = envVars.map((line: string) => {
    if (line.split('=')[0] === 'FITBIT_REFRESH_TOKEN') {
      return `FITBIT_REFRESH_TOKEN=${newRefreshToken}`;
    } else {
      return line;
    }
  });
  fs.writeFileSync(envFilePath, newEnvVars.join(os.EOL));
};

const updateCircleCIProjectEnvVar = async (newRefreshToken: string) => {
  const myCircleApiToken = process.env.MY_CIRCLE_API_TOKEN;
  if (!myCircleApiToken) {
    throw new Error('MY_CIRCLE_API_TOKEN environment variable does not exist.');
  }
  const myCircleProjectSlug = process.env.MY_CIRCLE_PROJECT_SLUG;
  if (!myCircleProjectSlug) {
    throw new Error('MY_CIRCLE_PROJECT_SLUG environment variable does not exist.');
  }
  const body = {
    name: 'FITBIT_REFRESH_TOKEN',
    value: newRefreshToken,
  };
  const response = await nodeFetch(`https://circleci.com/api/v2/project/${myCircleProjectSlug}/envvar`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'circle-token': myCircleApiToken,
    },
  });
  if (!response.ok) {
    const message = await response.json();
    throw new Error(`Failed to update CircleCI project env var: status=${response.status}, response=${JSON.stringify(message)}`);
  }
};

const saveNewRefreshToken = async (newRefreshToken: string) => {
  if (isLocal()) {
    await updateLocalDotEnvFile(newRefreshToken);
  } else {
    await updateCircleCIProjectEnvVar(newRefreshToken);
  }
};

interface Steps {
  dateTime: string,
  value: string,
}

const fetchStepsFromFitbit = async (accessToken: string): Promise<Steps[]> => {
  const response = await nodeFetch('https://api.fitbit.com/1/user/-/activities/steps/date/today/7d.json', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'authorization': `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch steps from Fitbit: ${response.status}.`);
  }
  const json = await response.json();
  return json['activities-steps'];
};

const putToPixela = async ({ dateTime, value: quantity }: Steps) => {
  const pixelaToken = process.env.PIXELA_TOKEN;
  if (!pixelaToken) {
    throw new Error('PIXELA_TOKEN environment variable does not exist.');
  }

  const pixelaGraphUrl = process.env.PIXELA_GRAPH_URL;
  if (!pixelaGraphUrl) {
    throw new Error('PIXELA_GRAPH_URL environment variable does not exist.');
  }

  const dateTimePath = dateTime.replace(/-/g, '');
  const response = await nodeFetch(`${pixelaGraphUrl}/${dateTimePath}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity }),
    headers: {
      'content-type': 'application/json',
      'x-user-token': pixelaToken,
    },
  });
  if (!response.ok) {
    const message = await response.json();
    throw new Error(`Failed to put steps to Pixela: status=${response.status}, response=${JSON.stringify(message)}`);
  }
};

const main = async () => {
  const [accessToken, newRefreshToken] = await fetchNewTokensFromFitbit();
  await saveNewRefreshToken(newRefreshToken);

  const stepsList = await fetchStepsFromFitbit(accessToken);
  for (let steps of stepsList) {
    await putToPixela(steps);
  }
};

main();
