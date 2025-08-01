import {
  onExistingPasswordProvidedEvent,
  WorkflowSettings,
  WorkflowTrigger,
  invalidateFormField,
  secureFetch,
  fetch,
  getEnvironmentVariable,
} from "@kinde/infrastructure";

// The setting for this workflow
export const workflowSettings: WorkflowSettings = {
  id: "onExistingPasswordProvided",
  name: "Drip Feed Migration",
  trigger: WorkflowTrigger.ExistingPasswordProvided,
  failurePolicy: {
    action: "stop",
  },
  bindings: {
    "kinde.widget": {}, // Required for accessing the UI
    "kinde.secureFetch": {}, // Required for secure external API calls
    "kinde.env": {}, // required to access your environment variables
    "kinde.fetch": {}, // Required for management API calls
    url: {}, // required for url params
  },
};

// The workflow code to be executed when the event is triggered
export default async function Workflow(event: onExistingPasswordProvidedEvent) {
  const { hashedPassword, providedEmail, password, hasUserRecordInKinde } =
    event.context.auth;

  // if (hasUserRecordInKinde) {
  //   console.log("User exists in Kinde");
  //   return;
  // }
  // console.log("User does not exist in Kinde");
  try {
    // The URL of the API you want to send the payload to
    const CHECK_PASSWORD_API_URL = getEnvironmentVariable(
      "CHECK_PASSWORD_API_URL"
    )?.value;

    if (!CHECK_PASSWORD_API_URL) {
      throw Error("Endpoint not set");
    }

    // The payload you want to send
    const payload = {
      email: providedEmail,
      password: password,
    };

    const { data: userData } = await secureFetch(CHECK_PASSWORD_API_URL, {
      method: "POST",
      responseFormat: "json",
      headers: {
        "content-type": "application/json",
      },
      body: payload,
    });

    if (!userData) {
      // If the email/password is not verified in the external system, you can invalidate the form field
      invalidateFormField("p_password", "Email or password not found");
    } else {
      // Password is verified in the external system
      // You can create the user in Kinde and set the password
      const kindeAPI = await createKindeAPI(event);

      // Create the user in Kinde
      // You can use the userData from the external system to populate the Kinde user
      const { data: res } = await kindeAPI.post({
        endpoint: `user`,
        params: JSON.stringify({
          profile: {
            given_name: userData.given_name,
            family_name: userData.family_name,
          },
          identities: [
            {
              type: "email",
              details: {
                email: providedEmail,
              },
            },
          ],
        }),
      });

      const userId = res.id;

      // Set the password for the user in Kinde
      // You can use the hashed password provided by Kinde
      const { data: pwdRes } = await kindeAPI.put({
        endpoint: `users/${userId}/password`,
        params: {
          hashed_password: hashedPassword,
        },
      });
      console.log(pwdRes.message);
    }
  } catch (error) {
    console.error("error", error);
  }
}