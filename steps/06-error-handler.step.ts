import {EventConfig} from 'motia'

// STEP-5: Sends formatted email with improved titles to the user using resend
export const config = {
    name: "generateTitles",
    type: "event",
    subscribes: ["yt.channel.error","yt.videos.error","yt.titles.error"],
    emits: ["yt.error.notified"],
    
    
};

export const handler = async (eventData: any, {emit, logger, state}:any )=>{

    try {
        const data = eventData || {};
        const jobId = data.jobId;
        const email = data.email;
        const error = data.error;
    
        logger.info("Handling error notification",{jobId, email})
    
        const RESEND_API_KEY = process.env.RESEND_API_KEY
        const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL
    
        if(!RESEND_API_KEY){
            throw new Error("Resend api key not configured.")
        }
    
        const emailText =`we are facing some issues in generating better titles for your channel.`
    
        const response = await fetch("https://api.resend.com/emails",{
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${RESEND_API_KEY}`
                },
                body: JSON.stringify({
                    from: RESEND_FROM_EMAIL,
                    to: [email],//we can send it to multiple emails
                    subject: `Request failed for youtube title doctor.`,
                    text: emailText
                })
        })
    
        if(!response.ok){
            const errorData = await response.json();
            throw new Error(`Resend api error ${errorData.error?.message}` || 'Unknown email error');
    
        }
        const emailResult = await response.json();
    
        // no need to change state here.
        //we'll just emit the event.
    
        await emit({
                topic: "yt.error.notified",
                data: {
                    jobId,
                    email,
                    emailId: emailResult.id,
                }
        })
        // we can also send notifications using slack tho.
    } catch (error) {
        logger.error("Failed to send error notification")
    }
}
// now we're done with the app and now you can do the api calls testing and then we'll just finish the project in the next commit if there are any.
//also read the docs, we've done api steps and event steps till now but you can go ahead and read more about cron steps.
// so we can have a service which sends us email every once in a week or a day or whatever you want we can use cron job step for it.
// oh and btw just go and look at the dependencies in package.json, ;) so less.