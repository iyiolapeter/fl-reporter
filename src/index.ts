import { IncomingWebhook } from "@slack/client";
import _startCase from "lodash.startcase";

export interface ChannelConfigOptions {
  name?: string;
}

export interface SlackConfigOptions extends ChannelConfigOptions {
  webhook: string;
}

export abstract class Channel<T = ChannelConfigOptions> {
  constructor(protected opts: T) {}

  public abstract async report(data: any): Promise<any>;
  public abstract format(message: any): any;
  public abstract errorFormat(error: Error): any;
}

export class Slack extends Channel<SlackConfigOptions> {
  private webhook: IncomingWebhook;
  constructor(opts: SlackConfigOptions) {
    super(opts);
    this.webhook = new IncomingWebhook(this.opts.webhook);
  }

  public async report(data: any) {
    return this.webhook.send(data);
  }

  public errorFormat(error: Error) {
    const { name, stack, message, ...rest } = error;
    const appName = `SERVICE: ${this.opts.name}`;
    const format: any[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hello, a new error has just been reported from *${
            this.opts.name
          }* with type: *${name}*.\n\n More details below...`
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Name*: ${name}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message*: ${message}`
        }
      }
    ];
    for (let [title, content] of Object.entries(rest)) {
      if (typeof content === "object" || Array.isArray(content)) {
        content = `\`\`\`${JSON.stringify(content, null, 2)}\`\`\``;
      }
      format.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${_startCase(title)}* [${title}]: ${content}`
        }
      });
    }
    format.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Stack Trace*\n \`\`\`${stack}\`\`\``
        }
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<!date^${Math.floor(
              new Date().getTime() / 1000
            )}^This message was reported {date_num} {time_secs}|Reported date could not be displayed>`
          }
        ]
      }
    );
    return {
      blocks: format,
      text: `${appName} - ${name} - Message: ${message}`
    };
    // return format;
  }

  public format(message: any) {
    const appName = `SERVICE: ${this.opts.name}`;
    const format = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hello, a new message has just been reported from *${
            this.opts.name
          }*`
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message*: \`\`\`${message}\`\`\``
        }
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<!date^${Math.floor(
              new Date().getTime() / 1000
            )}^This message was reported {date_num} {time_secs}|Reported date could not be displayed>`
          }
        ]
      }
    ];
    return {
      blocks: format,
      text: `${appName} - Message: ${message}`
    };
  }
}

interface ChannelGroup {
  [key: string]: Channel;
}

export class Reporter {
  public static configure(channels: ChannelGroup) {
    return new Reporter(channels);
  }

  constructor(private channels: ChannelGroup) {}

  public message(data: any) {
    return new Message(this.channels, data);
  }

  public error(error: Error) {
    return new Message(this.channels, error, true);
  }
}

class Message {
  private onlyStore: string[] = [];
  constructor(
    private group: ChannelGroup,
    private data: any,
    private isError: boolean = false
  ) {}

  public only(...args: string[]) {
    this.onlyStore = [...this.onlyStore, ...args];
    return this;
  }

  public async send() {
    try {
      const reporters = [];
      if (this.onlyStore.length > 0) {
        for (const only of this.onlyStore) {
          if (this.group[only]) {
            const channel = this.group[only];
            reporters.push(
              channel.report(
                this.isError
                  ? channel.errorFormat(this.data)
                  : channel.format(this.data)
              )
            );
          } else {
            // tslint:disable-next-line: no-console
            console.warn(
              `[Reporter] WARNING: Attempt to use "${only}" as a reporting channel but it has not been configured`
            );
          }
        }
      } else {
        for (const channel of Object.values(this.group)) {
          reporters.push(
            channel.report(
              this.isError
                ? channel.errorFormat(this.data)
                : channel.format(this.data)
            )
          );
        }
      }
      return await Promise.all(reporters);
    } catch (error) {
      return false;
    }
  }
}
