import {EventConfig} from 'motia'

// STEP-5: Sends formatted email with improved titles to the user using resend
export const config = {
    name: "generateTitles",
    type: "event",
    subscribes: ["yt.titles.ready"],
    emits: ["yt.email.send","yt.email.error"],
    
    
};

interface ImprovedTitles {
    original: string;
    improved: string;
    rational: string;
    url: string;

}

export const handler = async (eventData: any, {emit, logger, state}:any )=>{
    
    let jobId: string | undefined;

    try {
        const data = eventData || {};
        jobId = data.jobId;
        const email = data.email;
        const channelName = data.channelName;
        const improvedTitles = data.improvedTitles;

        logger.info("Sending email",{jobId, email, titleCount: improvedTitles.length})

        const RESEND_API_KEY = process.env.RESEND_API_KEY
        const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL

        if(!RESEND_API_KEY){
            throw new Error("Resend api key not configured.")
        }

        const jobData = await state.get(`job: ${jobId}`);
        
        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: "Sending email"
        })

        const emailText = generateEmailText(channelName, improvedTitles);

        const response = await fetch("https://api.resend.com/emails",{
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: RESEND_FROM_EMAIL,
                to: [email],//we can send it to multiple emails
                subject: `new titles for ${channelName} `,
                text: emailText
            })
        })

        if(!response.ok){
            const errorData = await response.json();
            throw new Error(`Resend api error ${errorData.error?.message}` || 'Unknown email error');

        }
        const emailResult = await response.json();
        logger.info("Email sent successfully",{
            jobId,
            emailId: emailResult.id,
        })

        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: 'Completed',
            emailId: emailResult.id,
            completedAt: new Date().toISOString()//toIsostring so that it's readable.
        })
        // emitting event
        await emit({
            topic: "yt.titles.ready",
            data: {
                jobId,
                email,
                emailId: emailResult.id,
            }

        })


    } catch (error: any) {
        logger.error("Error sending email",{
        error: error.message
        })
        if(!jobId){
            logger.error("Cannot send error notification because we have a missing jobId")
            return 
        }

        const jobData = await state.get(`job: ${jobId}`)

        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: 'Failed',
            error: error.message
        })

        // TODO: complete the error emission here below 

    }
}
// now we'll create the 06 file, in which we'll handle all the errors, or all the error events that we emitted.

    function generateEmailText(
    channelName: string,
    titles: ImprovedTitles[]
    ): string {
    let text = `YouTube Title Doctor – Improved Titles for ${channelName}\n`;
    text += `${"=".repeat(60)}\n\n`;

    titles.forEach((title, index) => {
        text += `Video ${index + 1}:\n`;
        text += `-------------\n`;
        text += `Original: ${title.original}\n`;
        text += `Improved: ${title.improved}\n`;
        text += `Why: ${title.rational}\n`;
        text += `Watch: ${title.url}\n\n`;
    });

    text += `${"=".repeat(60)}\n`;
    text += `Powered by Motia.dev\n`;

    return text;
    }
