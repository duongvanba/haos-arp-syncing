import { Injectable } from "@nestjs/common";
import { ViettelModem } from "../libs/ViettelModem.js";
import got from "got";
import { MODEM_IP, MODEM_PASSWORD, MODEM_USERNAME } from "../const.js";
import { filter, finalize, interval, lastValueFrom, mergeAll, mergeMap, startWith } from "rxjs";
import { execSync } from "child_process";




@Injectable()
export class ViettelService {

    async onModuleInit() {
        if (await this.#isViettelModem()) {
            console.log('Viettel modem detected, starting ARP syncing...')
            this.#loop()
        }
    }

    #loop() {
        lastValueFrom(interval(10 * 60000).pipe(
            startWith(0),
            mergeMap(async () => {
                console.log({
                    ip: MODEM_IP,
                    username: MODEM_USERNAME,
                    password: MODEM_PASSWORD
                })
                const vt = new ViettelModem(MODEM_IP!)
                await vt.login(MODEM_USERNAME!, MODEM_PASSWORD!)
                const hosts =  await vt.getArpTable()
                const onlines = hosts.filter(h => h.status == 1)
                console.log(`Found ${onlines.length} online hosts from Viettel modem`)
                return onlines
            }),
            mergeAll(), 
            mergeMap(async ({ destip, macaddr }) => {
                console.log(`Set ARP entry: ${destip} -> ${macaddr}`)
                try{
                    execSync(`sudo arp -s ${destip} ${macaddr}`)
                }catch(e){
                    console.error(`Failed to set ARP entry for ${destip}: ${(e as Error).message}`)
                }
            }),
            finalize(() => {
                console.log('ARP syncing completed')
            })
        ))
    }

    async #isViettelModem() {
        if (!MODEM_IP) return false
        const html = await got('https://' + MODEM_IP, { https: { rejectUnauthorized: false } }).text()
        if (html.includes('?_type=loginData')) return true
    }
}
